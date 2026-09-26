export type ShowControlMode = 'starting' | 'controlling' | 'following' | 'waiting' | 'unavailable';

/** One controller per same-origin, fixed-revision show session. A requested
 * takeover queues behind the current owner, which releases cooperatively.
 * We never steal a lock while its previous callback is still running. */
export function showControl(options: {
  key: string;
  requestRelease: () => void;
  change: (mode: ShowControlMode) => void;
  error: (error: unknown) => void;
}) {
  let mode: ShowControlMode = 'starting';
  let release: (() => void) | undefined;
  let pending: AbortController | undefined;
  let retry: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  function change(next: ShowControlMode) {
    options.change(next);
    mode = next;
  }
  function stopRetry() {
    clearInterval(retry);
    retry = undefined;
  }
  function relinquish() {
    if (!release) return;
    change('following');
    const done = release;
    release = undefined;
    done();
  }
  async function acquire(takeover = false) {
    if (closed || release || pending) return;
    if (!navigator.locks) {
      change('unavailable');
      return;
    }
    const request = new AbortController();
    pending = request;
    change(takeover ? 'waiting' : 'starting');
    const attempt = navigator.locks.request(
      options.key,
      takeover ? { signal: request.signal } : { ifAvailable: true },
      async (lock) => {
        if (pending === request) pending = undefined;
        stopRetry();
        if (closed) return;
        if (!lock) {
          change('following');
          return;
        }
        await new Promise<void>((resolve) => {
          release = resolve;
          change('controlling');
        });
      },
    );
    if (takeover) {
      options.requestRelease();
      // A simultaneously queued claimant may become owner after the first
      // message. Repeat only while this explicit takeover is still pending.
      retry = setInterval(options.requestRelease, 1000);
    }
    try {
      await attempt;
    } catch (error) {
      if (!closed) {
        relinquish();
        change('unavailable');
        options.error(error);
      }
    } finally {
      if (pending === request) {
        pending = undefined;
        stopRetry();
      }
    }
  }
  return {
    start: () => void acquire(),
    takeover: () => void acquire(true),
    async yieldIfRequested() {
      if (mode !== 'controlling' || !navigator.locks) return;
      const owner = release;
      try {
        const locks = await navigator.locks.query();
        // Delayed request messages must not evict a new owner after the
        // requesting window has already acquired/released/cancelled its lock.
        if (
          release === owner &&
          mode === 'controlling' &&
          locks.pending?.some((lock) => lock.name === options.key)
        )
          relinquish();
      } catch (error) {
        options.error(error);
      }
    },
    close() {
      closed = true;
      pending?.abort();
      stopRetry();
      relinquish();
    },
    get mode() {
      return mode;
    },
  };
}
