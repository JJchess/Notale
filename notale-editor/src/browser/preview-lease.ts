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
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let active: Promise<void> | undefined;
  let request: AbortController | undefined;
  let failed = false;
  let renewAt = 0;
  let banner: HTMLElement | undefined;
  function schedule(delay: number) {
    clearTimeout(timer);
    renewAt = Date.now() + delay;
    timer = setTimeout(() => void renew(), delay);
  }
  function notice() {
    if (banner) return;
    banner = document.createElement('aside');
    banner.dataset.notalePreviewAccess = '';
    banner.setAttribute('role', 'status');
    banner.style.cssText =
      'position:fixed;bottom:70px;left:12px;z-index:2147483647;background:#fff3df;color:#553715;padding:12px;border:1px solid #c29d64;border-radius:6px;font:14px system-ui;max-width:480px';
    banner.append('资源连接续期失败，当前画面已保留。连接恢复后可重试。 ');
    const retry = document.createElement('button');
    retry.textContent = '重试资源连接';
    retry.onclick = () => void renew();
    banner.append(retry);
    document.body.append(banner);
  }
  function renew() {
    if (stopped) return Promise.resolve();
    if (active) return active;
    clearTimeout(timer);
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
        banner?.remove();
        banner = undefined;
        schedule(value.renewAfterMs);
      } catch {
        if (stopped) return;
        failed = true;
        notice();
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
    stop() {
      stopped = true;
      clearTimeout(timer);
      request?.abort();
      banner?.remove();
      window.removeEventListener('online', resume);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', visible);
    },
  };
}
