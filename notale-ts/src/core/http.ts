/** Buffered HTTP with an idle read timeout and an independent caller deadline. */
import { Agent, Client, Pool, type Dispatcher } from 'undici';
import dns from 'node:dns';
import { channel } from 'node:diagnostics_channel';
import { createConnection, type Socket, type LookupFunction } from 'node:net';
import { once } from 'node:events';
import { Client as FtpClient, FTPError } from 'basic-ftp';
import { parsePasvResponse } from 'basic-ftp/dist/transfer.js';

/** urllib's Messages transport can follow an HTTP redirect to an FTP resource. */
export async function requestFtpBytes(address: string, timeoutSeconds: number, signal?: AbortSignal): Promise<{ response: Response; bytes: Buffer }> {
  const url = new URL(address);
  const unquote = (value: string) => value.replace(/(?:%[0-9a-f]{2})+/gi, bytes => Buffer.from(bytes.replaceAll('%', ''), 'hex').toString('utf8'));
  const commandText = (value: string) => {
    if (/[\r\n]/.test(value)) throw new Error('an illegal newline character should not be contained');
    return value;
  };
  const [pathname, ...attributes] = (url.pathname + url.search).split(';');
  const segments = pathname!.split('/').map(unquote);
  const file = commandText(segments.pop()!);
  if (segments[0] === '') segments.shift();
  const directory = commandText(segments.join('/')) || '.';
  let type = file ? 'I' : 'D';
  for (const attribute of attributes) {
    const [name, value] = attribute.split('=');
    if (name!.toLowerCase() === 'type' && /^[aid]$/i.test(value ?? '')) type = value!.toUpperCase();
  }
  const client = new FtpClient(0);
  let dataSocket: Socket | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    clearTimeout(timer);
    const deadline = performance.now() + timeoutSeconds * 1000;
    const expire = () => {
      const remaining = deadline - performance.now();
      if (remaining > 0) timer = setTimeout(expire, Math.min(remaining, 2147483647));
      else {
        const error = new Error('FTP read timed out');
        dataSocket?.destroy(error);
        client.ftp.closeWithError(error);
      }
    };
    timer = setTimeout(expire, Math.min(timeoutSeconds * 1000, 2147483647));
  };
  const abort = () => { dataSocket?.destroy(signal?.reason); client.close(); };
  signal?.throwIfAborted();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    // urllib resolves IPv4 before applying the socket timeout.
    const { address: host } = await dns.promises.lookup(unquote(url.hostname), { family: 4 });
    signal?.throwIfAborted();
    const user = commandText(unquote(url.username)) || 'anonymous';
    let password = commandText(unquote(url.password));
    if (user === 'anonymous' && (password === '' || password === '-')) password += 'anonymous@';
    const login = async () => {
      signal?.throwIfAborted();
      client.ftp.socket.removeListener('data', arm);
      const connect = client.connect(host, Number(url.port || 21));
      client.ftp.socket.on('data', arm);
      arm();
      await connect;
      await client.login(user, password);
      await client.send(`CWD ${directory}`);
    };
    await login();
    const transferType = `TYPE ${type === 'D' ? 'A' : type}`;
    try { await client.send(transferType); }
    catch {
      // urllib reconnects once when selecting the transfer type fails.
      await login();
      await client.send(transferType);
    }
    const receive = async (command: string) => {
      const passive = parsePasvResponse((await client.send('PASV')).message);
      // ftplib uses the control peer, not the host advertised in PASV. Keep the
      // data socket independent: a failing final control reply cannot discard it.
      const socket = dataSocket = createConnection({ host, port: passive.port });
      socket.on('error', () => {});
      const chunks: Buffer[] = [];
      try {
        await once(socket, 'connect');
        let started = false;
        let start!: () => void, failStart!: (error: unknown) => void;
        const ready = new Promise<void>((resolve, reject) => { start = resolve; failStart = reject; });
        const finished = client.ftp.handle(command, (response, task) => {
          if (started) {
            // urllib endtransfer consumes the final reply but suppresses its
            // FTP/socket error after the response body has been read.
            task.resolve(response instanceof Error ? { code: 200, message: '' } : response);
          } else if (response instanceof Error) {
            failStart(response); task.reject(response);
          } else if (response.code >= 100 && response.code < 200) {
            started = true; start();
          } else if (response.code < 200 || response.code >= 300) {
            const error = new FTPError(response);
            failStart(error); task.reject(error);
          }
        }).catch(error => { failStart(error); });
        await ready;
        for await (const chunk of socket) { arm(); chunks.push(Buffer.from(chunk)); }
        arm();
        await finished;
        signal?.throwIfAborted();
        return Buffer.concat(chunks);
      } finally { socket.destroy(); dataSocket = undefined; }
    };
    let bytes: Buffer | undefined;
    if (file && type !== 'D') {
      try { bytes = await receive(`RETR ${file}`); }
      catch (error) { if (!(error instanceof FTPError) || error.code !== 550) throw error; }
    }
    if (!bytes) {
      await client.send('TYPE A');
      if (file) {
        const previous = await client.pwd();
        try { await client.send(`CWD ${file}`); }
        finally { await client.send(`CWD ${commandText(previous)}`); }
      }
      bytes = await receive(file ? `LIST ${file}` : 'LIST');
    }
    signal?.throwIfAborted();
    return { response: new Response(null, { status: 200 }), bytes };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    client.close();
  }
}

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

export async function requestBytes(request: typeof fetch, url: string, init: RequestInit, timeoutSeconds: number, signal?: AbortSignal, onResponse?: (response: Response) => void): Promise<{ response: Response; bytes: Buffer; rawHeaders?: string[] | undefined }> {
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
  let rawHeaders: string[] | undefined;
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
              // Fetch merges duplicate headers; urllib redirects use the first.
              if (property === 'onHeaders' && Number(args[0]) >= 200 && Array.isArray(args[1])) {
                rawHeaders = args[1].map(value => Buffer.isBuffer(value) ? value.toString('latin1') : String(value));
              }
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
    onResponse?.(response);
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
    return { response, bytes: Buffer.concat(chunks), rawHeaders };
  } finally { finished = true; for (const release of clock.release) release(); readSocket?.off('data', arm); clearTimeout(timer); }
}
