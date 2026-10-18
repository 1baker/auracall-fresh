import { AsyncLocalStorage } from 'node:async_hooks';
import CDP from 'chrome-remote-interface';

export interface CdpCommandAdmission {
  run<T>(command: string, effect: () => Promise<T>, options?: { abortSignal?: AbortSignal }): Promise<T>;
  hold?(options?: { abortSignal?: AbortSignal }): Promise<CdpCommandAdmissionHold>;
}
export interface CdpCommandAdmissionHold {
  run<T>(command: string, effect: () => Promise<T>, options?: { abortSignal?: AbortSignal }): Promise<T>;
  close(): Promise<void>;
}
export interface CdpEndpoint { host: string; port: number }
let resolveAdmission: ((endpoint: CdpEndpoint) => Promise<CdpCommandAdmission | undefined>) | undefined;
const coordinatedSubjects = new WeakSet<object>();
interface ClientAdmissionState {
  admission: CdpCommandAdmission;
  hold?: CdpCommandAdmissionHold;
  acquiring?: boolean;
  closed: boolean;
}
const clientAdmissions = new WeakMap<object, ClientAdmissionState>();

interface CdpCommandTimeout {
  timeoutMs: number;
  timeoutMessage: string;
  abortSignal?: AbortSignal;
}
const commandTimeouts = new AsyncLocalStorage<CdpCommandTimeout>();
const commandAbortSignals = new AsyncLocalStorage<AbortSignal>();

/** Keep caller cancellation on admission for commands outside a wire-timeout scope. */
export function withCdpCommandAbortSignal<T>(signal: AbortSignal | undefined, effect: () => Promise<T>): Promise<T> {
  if (!signal) return effect();
  signal.throwIfAborted();
  const parent = commandAbortSignals.getStore();
  return commandAbortSignals.run(parent && parent !== signal ? AbortSignal.any([parent, signal]) : signal, effect);
}

async function runTimedCdpEffect<T>(options: CdpCommandTimeout, effect: () => Promise<T>): Promise<T> {
  options.abortSignal?.throwIfAborted();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => { options.abortSignal?.throwIfAborted(); return effect(); }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(options.timeoutMessage)), options.timeoutMs);
        if (options.abortSignal) {
          onAbort = () => reject(options.abortSignal?.reason ?? new Error('CDP command cancelled.'));
          options.abortSignal.addEventListener('abort', onAbort, { once: true });
        }
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (onAbort) options.abortSignal?.removeEventListener('abort', onAbort);
  }
}

/** Admission remains mandatory; only the admitted wire effect consumes this deadline. */
export async function withCdpCommandTimeout<T>(subject: unknown, options: CdpCommandTimeout, effect: () => Promise<T>): Promise<T> {
  options.abortSignal?.throwIfAborted();
  return hasCdpCommandAdmission(subject)
    ? commandTimeouts.run(options, effect)
    : runTimedCdpEffect(options, effect);
}

/** A request interceptor must retain this hold until interception cleanup completes. */
export async function holdCdpCommandAdmission(client: object, options?: { abortSignal?: AbortSignal }): Promise<CdpCommandAdmissionHold> {
  const state = clientAdmissions.get(client);
  if (!state?.admission.hold) throw new Error('Continuous CDP ownership is unavailable for this client.');
  if (state.closed) throw new Error('CDP client is closed.');
  if (state.hold || state.acquiring) throw new Error('Continuous CDP ownership is already held for this client.');
  state.acquiring = true;
  try {
    const hold = await state.admission.hold(options);
    if (state.closed) {
      await hold.close();
      throw new Error('CDP client closed during continuous ownership acquisition.');
    }
    state.hold = hold;
    return { run: (command, effect, context) => hold.run(command, effect, context), close: async () => {
      await hold.close();
      if (state.hold === hold) state.hold = undefined;
    } };
  } finally { state.acquiring = false; }
}

/** Observation code can choose bounded commands without weakening admission. */
export function hasCdpCommandAdmission(subject: unknown): boolean {
  return typeof subject === 'object' && subject !== null && coordinatedSubjects.has(subject);
}


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
  const timeout = commandTimeouts.getStore();
  const callerSignal = commandAbortSignals.getStore();
  const abortSignal = timeout?.abortSignal && callerSignal && timeout.abortSignal !== callerSignal
    ? AbortSignal.any([timeout.abortSignal, callerSignal]) : timeout?.abortSignal ?? callerSignal;
  const result = admission.run(command, async () => {
    abortSignal?.throwIfAborted();
    return timeout ? runTimedCdpEffect({ ...timeout, abortSignal }, async () => invoke(...args)) : invoke(...args);
  }, { abortSignal });
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
      coordinatedSubjects.add(client);
      if (client.Runtime && typeof client.Runtime === 'object') coordinatedSubjects.add(client.Runtime);
      const send = client.send.bind(client);
      const state: ClientAdmissionState = { admission, closed: false };
      clientAdmissions.set(client, state);
      client.send = (...commandArgs: unknown[]) => admittedCall(state.hold ?? state.admission, String(commandArgs[0]), send, commandArgs);
      if (typeof client.close === 'function') {
        const close = client.close.bind(client);
        client.close = async () => {
          state.closed = true;
          await close();
          await state.hold?.close();
          state.hold = undefined;
        };
      }
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
