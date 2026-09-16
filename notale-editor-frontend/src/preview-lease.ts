import type {LeaseStatus} from './state/resource-notices';
/** Renew stable content URLs through authenticated host API calls. No iframe,
 * source DOM, animation timeline or native simulation is reconstructed. */
export function keepPreviewAlive(
  documentId: string,
  preview: {
    channel: string;
    version: number;
    expiresAt: number;
    renewAfterMs: number;
  },
  onStatus:(status:LeaseStatus)=>void=()=>{},
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let active: Promise<void> | undefined;
  let request: AbortController | undefined;
  let failed = false;
  let renewAt = 0;
  function schedule(delay: number) {
    clearTimeout(timer);
    renewAt = Date.now() + delay;
    timer = setTimeout(() => void renew(), delay);
  }
  function renew() {
    if (stopped) return Promise.resolve();
    if (active) return active;
    clearTimeout(timer);
    if(failed)onStatus('retrying');
    request = new AbortController();
    const controller = request;
    const deadline = setTimeout(() => controller.abort(), 15000);
    active = (async () => {
      try {
        const response = await fetch(
          `/api/documents/${encodeURIComponent(documentId)}/preview/renew`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: preview.channel, version: preview.version }),
            signal: controller.signal,
          },
        );
        if (!response.ok) throw new Error(`Preview renewal: ${response.status}`);
        const value = await response.json();
        if (
          value.channel !== preview.channel ||
          value.version !== preview.version ||
          !Number.isFinite(value.expiresAt) ||
          !Number.isFinite(value.renewAfterMs) ||
          value.renewAfterMs < 1000 ||
          value.renewAfterMs > 1800000
        )
          throw new Error('Invalid preview renewal response');
        if (stopped) return;
        failed = false;
        onStatus('healthy');
        schedule(value.renewAfterMs);
      } catch {
        if (stopped) return;
        failed = true;
        onStatus('failed');
        schedule(15000);
      } finally {
        clearTimeout(deadline);
        active = undefined;
      }
    })();
    return active;
  }
  function resume() {
    if (failed || Date.now() >= renewAt) void renew();
  }
  function visible() {
    if (document.visibilityState === 'visible') resume();
  }
  window.addEventListener('online', resume);
  window.addEventListener('focus', resume);
  document.addEventListener('visibilitychange', visible);
  schedule(
    Number.isFinite(preview.renewAfterMs)
      ? Math.max(1000, Math.min(1800000, preview.renewAfterMs))
      : 1800000,
  );
  return {
    renew,
    stop() {
      stopped = true;
      clearTimeout(timer);
      request?.abort();
      onStatus('stopped');
      window.removeEventListener('online', resume);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', visible);
    },
  };
}
