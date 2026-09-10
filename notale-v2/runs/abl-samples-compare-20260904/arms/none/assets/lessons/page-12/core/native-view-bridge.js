(() => {
  "use strict";

  const configuration = window.__NOTALE_NATIVE_VIEW__;
  delete window.__NOTALE_NATIVE_VIEW__;
  if (!configuration?.channel) return;
  const bridgeScript = document.currentScript;
  bridgeScript?.previousElementSibling?.remove();
  bridgeScript?.remove();

  const parentWindow = window.parent;
  const envelope = {
    source: configuration.source,
    version: configuration.version,
    channel: configuration.channel,
  };

  function send(type, payload = {}) {
    parentWindow.postMessage({ ...envelope, type, ...payload }, "*");
  }

  function messageOf(value) {
    if (value instanceof Error) return value.message || value.name;
    if (value && typeof value === "object" && "message" in value) return String(value.message);
    return String(value || "未知错误");
  }

  function report(value, phase) {
    send("error", { message: messageOf(value), phase });
  }

  window.addEventListener("error", (event) => {
    event.preventDefault();
    report(event.error || event.message, "script");
  });
  window.addEventListener("unhandledrejection", (event) => {
    event.preventDefault();
    report(event.reason, "promise");
  });

  const blocked = (name) => function blockedCapability() {
    throw new TypeError(`原生视图沙箱不允许使用 ${name}；数据必须来自 renderNotaleView(packet)。`);
  };
  for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "Worker", "SharedWorker"] ) {
    try {
      Object.defineProperty(window, name, {
        value: blocked(name),
        writable: false,
        configurable: false,
      });
    } catch {
      // CSP remains the final network boundary when a browser property is not replaceable.
    }
  }

  function freeze(value, seen = new WeakSet()) {
    if (!value || typeof value !== "object" || seen.has(value)) return value;
    seen.add(value);
    for (const child of Object.values(value)) freeze(child, seen);
    return Object.freeze(value);
  }

  function render(packet) {
    const renderer = window.renderNotaleView;
    if (typeof renderer !== "function") {
      throw new TypeError("view/render.js 必须定义 window.renderNotaleView = (packet) => { ... }。");
    }
    const safePacket = freeze(packet);
    const playback = safePacket?.playback || {};
    document.documentElement.dataset.reason = String(playback.reason || "frame");
    document.documentElement.dataset.frameIndex = String(playback.index ?? -1);
    document.documentElement.dataset.frameCount = String(playback.count ?? 0);
    document.documentElement.dataset.playing = String(Boolean(playback.playing));
    document.documentElement.dataset.speed = String(playback.speed ?? 1);
    document.documentElement.dataset.reducedMotion = String(Boolean(safePacket?.environment?.reducedMotion));
    document.documentElement.dataset.previousSequence = safePacket?.previousStep
      ? String(safePacket.previousStep.sequence ?? "")
      : "";
    const result = renderer(safePacket);
    if (result && typeof result.then === "function") {
      throw new TypeError("renderNotaleView 必须同步完成渲染，不能返回 Promise。");
    }
    send("rendered", { playback });
  }

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (
      event.source !== parentWindow
      || !message
      || message.source !== envelope.source
      || message.version !== envelope.version
      || message.channel !== envelope.channel
      || message.type !== "render"
    ) return;
    event.stopImmediatePropagation();
    try {
      render(message.packet);
    } catch (error) {
      report(error, "render");
    }
  }, { capture: true });

  const ready = () => send("ready");
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ready, { once: true });
  } else {
    queueMicrotask(ready);
  }
})();
