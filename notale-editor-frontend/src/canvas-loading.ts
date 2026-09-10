/** Frame readiness comes from the authenticated slide bridge, not iframe.onload. */
export function createCanvasLoading(retry: () => Promise<unknown>, report: (error: unknown) => void) {
  const panel = document.createElement('aside');
  panel.id = 'canvas-loading';
  panel.hidden = true;
  panel.setAttribute('aria-live', 'polite');
  const status = document.createElement('p');
  status.id = 'canvas-loading-status';
  const button = document.createElement('button');
  button.id = 'retry-canvas';
  button.textContent = '重新加载画布';
  panel.append(status, button);
  document.getElementById('canvas-viewport')!.append(panel);
  let appear: ReturnType<typeof setTimeout> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  function clear() { clearTimeout(appear); clearTimeout(timeout); }
  button.onclick = () => { button.disabled = true; void retry().catch(report).finally(() => { button.disabled = false; }); };
  return {
    start() {
      clear(); panel.hidden = true; button.hidden = true;
      status.textContent = '正在加载讲义…';
      appear = setTimeout(() => { panel.hidden = false; }, 400);
      timeout = setTimeout(() => {
        panel.hidden = false; button.hidden = false;
        status.textContent = '讲义尚未加载完成，请检查连接后重试。';
      }, 8000);
    },
    ready() { clear(); panel.hidden = true; },
  };
}
