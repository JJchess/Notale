const MESSAGE_SOURCE = "notale-native-view";
const MESSAGE_VERSION = 1;
const READY_TIMEOUT_MS = 10_000;

let channelSerial = 0;

function createChannel() {
  channelSerial += 1;
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `view-${Date.now().toString(36)}-${channelSerial.toString(36)}`;
}

async function fetchText(url, label) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${label} 载入失败（HTTP ${response.status}）。`);
  return response.text();
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeStyle(value) {
  return String(value).replace(/<\/style/gi, "<\\/style");
}

function escapeScript(value) {
  return String(value).replace(/<\/script/gi, "<\\/script");
}

function validateMarkup(markup) {
  const forbidden = markup.match(/<\s*\/?\s*(html|head|body|script|style|base|link|meta|iframe|object|embed)\b/i);
  if (forbidden) {
    throw new Error(`view/index.html 只能写 body 内的原生标记，不能包含 <${forbidden[1].toLowerCase()}>。`);
  }
}

function buildPolicy(baseUrl) {
  const origin = new URL(baseUrl).origin;
  const localImages = origin && origin !== "null" ? ` ${origin}` : "";
  return [
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    "style-src 'unsafe-inline'",
    `img-src data: blob:${localImages}`,
    "font-src 'none'",
    "media-src data: blob:",
    "connect-src 'none'",
    "worker-src 'none'",
    "frame-src 'none'",
    `base-uri ${origin && origin !== "null" ? origin : "'none'"}`,
    "form-action 'none'",
  ].join("; ");
}

function buildDocument({ baseUrl, baseCss, authorCss, markup, bridgeSource, authorSource, channel }) {
  const configuration = `window.__NOTALE_NATIVE_VIEW__=${JSON.stringify({
    source: MESSAGE_SOURCE,
    version: MESSAGE_VERSION,
    channel,
  })};`;
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="${escapeAttribute(buildPolicy(baseUrl))}">
    <base href="${escapeAttribute(baseUrl)}">
    <style>${escapeStyle(baseCss)}</style>
    <style>${escapeStyle(authorCss)}</style>
  </head>
  <body>
    ${markup}
    <script>${escapeScript(configuration)}</script>
    <script>${escapeScript(bridgeSource)}</script>
    <script>${escapeScript(authorSource)}</script>
  </body>
</html>`;
}

export function createNativeView(host, options = {}) {
  if (!(host instanceof HTMLElement)) throw new TypeError("原生视图需要有效的宿主元素。");

  const viewBaseUrl = new URL(options.viewBaseUrl || "../lesson/view/", import.meta.url);
  const fixedBaseUrl = new URL("./", import.meta.url);
  const channel = createChannel();
  let iframe = null;
  let ready = false;
  let mounted = false;
  let disposed = false;
  let pendingPacket = null;
  let lastPacket = null;
  let renderCount = 0;
  let resolveReady = null;
  let rejectReady = null;

  const readyPromise = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  function reportError(message) {
    const error = message instanceof Error ? message : new Error(String(message || "未知视图错误"));
    options.onError?.(error);
  }

  function post(packet) {
    if (!iframe?.contentWindow || disposed) return;
    iframe.contentWindow.postMessage({
      source: MESSAGE_SOURCE,
      version: MESSAGE_VERSION,
      channel,
      type: "render",
      packet,
    }, "*");
  }

  function handleMessage(event) {
    if (disposed || event.source !== iframe?.contentWindow) return;
    const message = event.data;
    if (
      !message
      || message.source !== MESSAGE_SOURCE
      || message.version !== MESSAGE_VERSION
      || message.channel !== channel
    ) return;

    if (message.type === "ready") {
      if (!ready) {
        ready = true;
        resolveReady?.();
        options.onReady?.();
      }
      if (pendingPacket) {
        const packet = pendingPacket;
        pendingPacket = null;
        post(packet);
      }
      return;
    }
    if (message.type === "rendered") {
      renderCount += 1;
      options.onRendered?.(message.playback || null);
      return;
    }
    if (message.type === "error") {
      const detail = [message.message, message.phase ? `阶段：${message.phase}` : ""]
        .filter(Boolean)
        .join("；");
      reportError(detail);
    }
  }

  async function mount() {
    if (mounted) return readyPromise;
    if (disposed) throw new Error("原生视图已经销毁。");
    mounted = true;
    window.addEventListener("message", handleMessage);

    try {
      const [baseCss, bridgeSource, markup, authorCss, authorSource] = await Promise.all([
        fetchText(new URL("native-view.css", fixedBaseUrl), "native-view.css"),
        fetchText(new URL("native-view-bridge.js", fixedBaseUrl), "native-view-bridge.js"),
        fetchText(new URL("index.html", viewBaseUrl), "view/index.html"),
        fetchText(new URL("style.css", viewBaseUrl), "view/style.css"),
        fetchText(new URL("render.js", viewBaseUrl), "view/render.js"),
      ]);
      validateMarkup(markup);

      iframe = document.createElement("iframe");
      iframe.className = "native-view-frame";
      iframe.title = options.title || "算法状态可视化";
      iframe.setAttribute("sandbox", "allow-scripts");
      iframe.setAttribute("referrerpolicy", "no-referrer");
      iframe.srcdoc = buildDocument({
        baseUrl: viewBaseUrl.href,
        baseCss,
        authorCss,
        markup,
        bridgeSource,
        authorSource,
        channel,
      });
      host.replaceChildren(iframe);
    } catch (error) {
      rejectReady?.(error);
      reportError(error);
      throw error;
    }

    const timeout = window.setTimeout(() => {
      if (ready || disposed) return;
      const error = new Error("原生视图沙箱启动超时。");
      rejectReady?.(error);
      reportError(error);
    }, READY_TIMEOUT_MS);
    try {
      await readyPromise;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function render(packet) {
    if (disposed) return;
    lastPacket = packet;
    if (!ready) {
      pendingPacket = packet;
      return;
    }
    post(packet);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    ready = false;
    pendingPacket = null;
    lastPacket = null;
    window.removeEventListener("message", handleMessage);
    iframe?.remove();
    iframe = null;
  }

  return {
    mount,
    render,
    dispose,
    getState() {
      return { mounted, ready, renderCount, lastPacket };
    },
  };
}
