/** PDF preparation needs both authored runtime readiness and loaded page resources. */
export function waitForPrintPages(
  sheet: Window,
  pages: { frame: HTMLIFrameElement; slideId: string }[],
  channel: string,
  signal: AbortSignal,
  timeoutMs = 20000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const state = pages.map((page) => ({
      ...page,
      loaded: false,
      ready: false,
    }));
    const cleanup: (() => void)[] = [];
    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      for (const dispose of cleanup) dispose();
      if (error) reject(error);
      else resolve();
    };
    const check = () => {
      if (state.every((page) => page.loaded && page.ready)) finish();
    };
    for (const page of state) {
      const loaded = () => {
        page.loaded = true;
        check();
      };
      page.frame.addEventListener("load", loaded);
      cleanup.push(() => page.frame.removeEventListener("load", loaded));
    }
    const message = (event: MessageEvent) => {
      const data = event.data;
      if (
        data?.source !== "notale-slide" ||
        data.channel !== channel ||
        data.type !== "ready"
      )
        return;
      const page = state.find(
        (page) =>
          event.source === page.frame.contentWindow &&
          event.origin === new URL(page.frame.src).origin &&
          data.data?.slideId === page.slideId,
      );
      if (page) {
        page.ready = true;
        check();
      }
    };
    sheet.addEventListener("message", message);
    cleanup.push(() => sheet.removeEventListener("message", message));
    const closed = () => finish(new Error("导出窗口已关闭，PDF 导出已取消"));
    sheet.addEventListener("pagehide", closed);
    cleanup.push(() => sheet.removeEventListener("pagehide", closed));
    // Window closure is not guaranteed to dispatch pagehide to the opener.
    const closureTimer = setInterval(() => { if (sheet.closed) closed(); }, 250);
    cleanup.push(() => clearInterval(closureTimer));
    const aborted = () => finish(new Error("编辑会话已关闭，PDF 导出已取消"));
    signal.addEventListener("abort", aborted, { once: true });
    cleanup.push(() => signal.removeEventListener("abort", aborted));
    const timer = setTimeout(
      () => finish(new Error("部分页面未能完成加载，请稍后重新导出 PDF")),
      timeoutMs,
    );
    cleanup.push(() => clearTimeout(timer));
    if (sheet.closed) closed();
    else if (signal.aborted) aborted();
    else check();
  });
}
