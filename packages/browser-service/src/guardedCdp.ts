import CDP from 'chrome-remote-interface';

export interface CdpCommandAdmission {
  run<T>(command: string, effect: () => Promise<T>): Promise<T>;
}
export interface CdpEndpoint { host: string; port: number }
let resolveAdmission: ((endpoint: CdpEndpoint) => Promise<CdpCommandAdmission | undefined>) | undefined;

/** The embedding application owns coordination policy; the shared transport owns enforcement. */
export function setCdpCommandAdmissionResolver(resolver: typeof resolveAdmission): void {
  resolveAdmission = resolver;
}

export async function resolveCdpCommandAdmission(endpoint: CdpEndpoint): Promise<CdpCommandAdmission | undefined> {
  return resolveAdmission?.(endpoint);
}

function endpoint(options: unknown): CdpEndpoint {
  const input = (options && typeof options === 'object' ? options : {}) as { host?: unknown; port?: unknown; target?: unknown };
  if (typeof input.target === 'string' && /^wss?:\/\//.test(input.target)) {
    const target = new URL(input.target);
    return { host: target.hostname, port: Number(target.port || (target.protocol === 'wss:' ? 443 : 80)) };
  }
  return { host: typeof input.host === 'string' ? input.host : '127.0.0.1',
    port: typeof input.port === 'number' ? input.port : 9222 };
}

function admittedCall(
  admission: CdpCommandAdmission,
  command: string,
  invoke: (...args: unknown[]) => unknown,
  args: unknown[],
): unknown {
  const callback = typeof args.at(-1) === 'function' ? args.pop() as (error: unknown, result?: unknown) => void : undefined;
  const result = admission.run(command, async () => invoke(...args));
  if (!callback) return result;
  void result.then((value) => callback(null, value), (error: unknown) => callback(error));
  return undefined;
}

/** Every generated domain command in chrome-remote-interface calls client.send. */
const guardedCdp: typeof CDP = new Proxy(CDP, {
  apply(target, thisArg, args: unknown[]) {
    const requestedEndpoint = endpoint(args[0]);
    if (!resolveAdmission || !requestedEndpoint) return Reflect.apply(target, thisArg, args);
    if (args.some((value) => typeof value === 'function')) {
      throw new Error('Coordinated CDP connections require the promise interface.');
    }
    return Promise.resolve(Reflect.apply(target, thisArg, args)).then(async (client) => {
      let admission: CdpCommandAdmission | undefined;
      try { admission = await resolveAdmission?.(requestedEndpoint); }
      catch (error) { await client.close?.(); throw error; }
      if (!admission || typeof client.send !== 'function') return client;
      const send = client.send.bind(client);
      client.send = (...commandArgs: unknown[]) => admittedCall(admission, String(commandArgs[0]), send, commandArgs);
      return client;
    });
  },
  get(target, key, receiver) {
    const value = Reflect.get(target, key, receiver);
    if (!['New', 'Close', 'Activate'].includes(String(key)) || typeof value !== 'function') return value;
    return async (...args: unknown[]) => {
      const requestedEndpoint = endpoint(args[0]);
      const admission = requestedEndpoint ? await resolveAdmission?.(requestedEndpoint) : undefined;
      if (!admission) return Reflect.apply(value, target, args);
      return admittedCall(admission, `Target.${String(key)}`, (...input) => Reflect.apply(value, target, input), args);
    };
  },
});
export default guardedCdp;
