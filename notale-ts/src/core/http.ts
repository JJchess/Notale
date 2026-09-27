/** Buffered HTTP with an idle read timeout and an independent caller deadline. */
import { Agent, Client, Pool, type Dispatcher } from 'undici';
import dns from 'node:dns';
import { channel } from 'node:diagnostics_channel';
import type { Socket, LookupFunction } from 'node:net';

// Undici creates its request synchronously during dispatch, but assigns a pooled
// socket later. Match those events so only this request's reads renew its timer.
type ObserveSocket = (socket: Socket) => void;
let dispatchObserver: ObserveSocket | undefined;
const observers = new WeakMap<object, ObserveSocket>();
channel('undici:request:create').subscribe(message => {
  if (dispatchObserver) observers.set((message as { request: object }).request, dispatchObserver);
});
channel('undici:client:sendHeaders').subscribe(message => {
  const { request, socket } = message as { request: object; socket: Socket };
  observers.get(request)?.(socket);
});

// The caller's deadline controls timeouts, not Undici's implicit 10s/300s caps.
interface RequestClock { pause(): void; resume(): void; read: ObserveSocket; release: Set<() => void>; }
const handlerClocks = new WeakMap<object, RequestClock>();
const dispatcher = new Agent({
  connect: { timeout: 0 }, headersTimeout: 0, bodyTimeout: 0,
  factory: (origin, options) => new Pool(origin, {
    ...options,
    factory: (origin, options) => {
      const waiting = new Set<RequestClock>();
      let resolving = false;
      const lookup: LookupFunction = (hostname, options, callback) => {
        resolving = true;
        for (const clock of waiting) clock.pause();
        const done: typeof callback = (...args) => {
          resolving = false;
          for (const clock of waiting) clock.resume();
          callback(...args);
        };
        try { (dns.lookup as LookupFunction)(hostname, options, done); }
        catch (error) { resolving = false; for (const clock of waiting) clock.resume(); throw error; }
      };
      const client = new Client(origin, { ...options, connect: { timeout: 0, lookup } });
      const dispatch = client.dispatch.bind(client);
      client.dispatch = (options, handler) => {
        const clock = handlerClocks.get(handler);
        if (!clock) return dispatch(options, handler);
        const release = () => { waiting.delete(clock); clock.release.delete(release); };
        waiting.add(clock); clock.release.add(release);
        if (resolving) clock.pause();
        const previous = dispatchObserver; dispatchObserver = clock.read;
        try { return dispatch(options, new Proxy(handler, {
          get(target, property) {
            const callback = Reflect.get(target, property);
            if (property === 'onComplete' || property === 'onError') return (...args: unknown[]) => {
              release(); return typeof callback === 'function' ? callback.apply(target, args) : undefined;
            };
            return typeof callback === 'function' ? callback.bind(target) : callback;
          },
        })); } catch (error) { release(); throw error; }
        finally { dispatchObserver = previous; }
      };
      return client;
    },
  }),
});

export async function requestBytes(request: typeof fetch, url: string, init: RequestInit, timeoutSeconds: number, signal?: AbortSignal): Promise<{ response: Response; bytes: Buffer }> {
  const timeout = new AbortController();
  const combined = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finished = false;
  let resolving = false;
  const arm = () => {
    if (finished || resolving || combined.aborted) return;
    clearTimeout(timer);
    const duration = timeoutSeconds * 1000, deadline = performance.now() + duration;
    const expire = () => {
      const remaining = deadline - performance.now();
      if (remaining > 0) timer = setTimeout(expire, Math.min(remaining, 2147483647));
      else timeout.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
    };
    timer = setTimeout(expire, Math.min(duration, 2147483647));
  };
  let readSocket: Socket | undefined;
  const observeSocket: ObserveSocket = socket => {
    if (finished || combined.aborted) return;
    readSocket?.off('data', arm);
    readSocket = socket;
    // Includes partial headers and chunk framing, before fetch exposes a body.
    socket.on('data', arm);
  };
  const clock: RequestClock = { read: observeSocket, release: new Set(),
    pause() { resolving = true; clearTimeout(timer); },
    resume() { resolving = false; arm(); },
  };
  const progressDispatcher: Pick<Dispatcher, 'dispatch'> = {
    dispatch(options, handler) {
      const observed = new Proxy(handler, {
        get(target, property) {
          const callback = Reflect.get(target, property);
          if (['onConnect', 'onBodySent', 'onRequestSent', 'onHeaders'].includes(String(property))) {
            return (...args: unknown[]) => {
              arm();
              return typeof callback === 'function' ? callback.apply(target, args) : undefined;
            };
          }
          return typeof callback === 'function' ? callback.bind(target) : callback;
        },
      });
      handlerClocks.set(observed, clock);
      return dispatcher.dispatch(options, observed);
    },
  };
  try {
    combined.throwIfAborted();
    arm();
    const response = await request(url, { ...init, ...(request === globalThis.fetch ? { dispatcher: progressDispatcher } : {}), signal: combined });
    const chunks: Uint8Array[] = [];
    if (response.body) {
      const reader = response.body.getReader();
      try {
        while (true) {
          arm();
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
    }
    combined.throwIfAborted();
    return { response, bytes: Buffer.concat(chunks) };
  } finally { finished = true; for (const release of clock.release) release(); readSocket?.off('data', arm); clearTimeout(timer); }
}
