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

  // Playback owns motion lifetime. Views only choose which marks transition.
  let motionIndex = -1;
  const motions = new Set();
  const tweens = new Set();
  window.NotaleMotion = {
    duration: 0,
    tween(duration, draw) {
      if (!this.duration) { draw(1); return; }
      const token = { raf: 0, stop: () => { cancelAnimationFrame(token.raf); tweens.delete(token); } };
      const ms = Math.max(0, Number(duration) || 0);
      if (!ms) { draw(1); return; }
      tweens.add(token);
      const started = performance.now();
      draw(0);
      const tick = now => {
        try {
          const t = Math.min(1, (now - started) / ms);
          draw(t);
          if (t < 1) token.raf = requestAnimationFrame(tick); else token.stop();
        } catch (error) { token.stop(); report(error, 'animation'); }
      };
      token.raf = requestAnimationFrame(tick);
    },
    animate(element, frames, options = {}) {
      if (!this.duration) return;
      const animation = element.animate(frames, {
        duration: this.duration, easing: "ease-out", ...options,
      });
      motions.add(animation);
      animation.onfinish = animation.oncancel = () => motions.delete(animation);
      return animation;
    },
  };
  window.patchSvg = (container, markup, { animate = false } = {}) => {
    const template = document.createElement('template');
    template.innerHTML = markup;
    const fresh = template.content.firstElementChild;
    if (!fresh || fresh.localName !== 'svg') throw new TypeError('patchSvg needs one SVG root');
    const properties = ['stroke', 'strokeWidth', 'opacity', 'strokeDasharray'];
    const appearance = node => Object.fromEntries(properties.map(key => [key, getComputedStyle(node)[key]]));
    function patch(target, source) {
      if (!target || target.nodeType !== source.nodeType || target.nodeName !== source.nodeName) {
        const replacement = source.cloneNode(true);
        if (target) target.replaceWith(replacement);
        return replacement;
      }
      if (source.nodeType !== Node.ELEMENT_NODE) {
        if (target.nodeValue !== source.nodeValue) target.nodeValue = source.nodeValue;
        return target;
      }
      const before = animate && target.matches('path,circle') ? appearance(target) : null;
      for (const attr of [...target.attributes]) if (!source.hasAttribute(attr.name)) target.removeAttribute(attr.name);
      for (const attr of source.attributes) target.setAttribute(attr.name, attr.value);
      const old = [...target.childNodes];
      const keyed = new Map(old.filter(n => n.nodeType === 1 && n.id).map(n => [n.id, n]));
      const used = new Set();
      [...source.childNodes].forEach((child, i) => {
        let candidate = child.nodeType === 1 && child.id ? keyed.get(child.id) : old[i];
        if (used.has(candidate) || (candidate?.nodeType === 1 && candidate.id && candidate.id !== child.id)) candidate = null;
        if (candidate) used.add(candidate);
        const node = patch(candidate, child);
        if (target.childNodes[i] !== node) target.insertBefore(node, target.childNodes[i] || null);
      });
      while (target.childNodes.length > source.childNodes.length) target.lastChild.remove();
      if (before) {
        const after = appearance(target);
        if (JSON.stringify(before) !== JSON.stringify(after)) window.NotaleMotion.animate(target, [before, after]);
      }
      return target;
    }
    const root = patch(container.firstElementChild, fresh);
    if (!root.parentNode) container.replaceChildren(root);
    return root;
  };
  function render(packet) {
    const renderer = window.renderNotaleView;
    if (typeof renderer !== "function") {
      throw new TypeError("view/render.js 必须定义 window.renderNotaleView = (packet) => { ... }。");
    }
    const safePacket = freeze(packet);
    const playback = safePacket?.playback || {};
    for (const [key, value] of Object.entries(safePacket.environment?.theme || {})) {
      document.documentElement.style.setProperty(`--code-${key}`, value);
    }
    for (const animation of motions) animation.cancel();
    for (const tween of [...tweens]) tween.stop();
    motions.clear();
    window.NotaleMotion.duration = (playback.playing || playback.reason === "step")
      && playback.index === motionIndex + 1
      && playback.reason !== "reset" && playback.reason !== "seek"
      && !safePacket.environment?.reducedMotion
      ? Math.max(0, Number(playback.transitionMs) || 0) : 0;
    motionIndex = playback.index;
    document.documentElement.dataset.reason = String(playback.reason || "frame");
    document.documentElement.dataset.frameIndex = String(playback.index ?? -1);
    document.documentElement.dataset.frameCount = String(playback.count ?? 0);
    document.documentElement.dataset.playing = String(Boolean(playback.playing));
    document.documentElement.dataset.speed = String(playback.speed ?? 1);
    document.documentElement.dataset.reducedMotion = String(Boolean(safePacket?.environment?.reducedMotion));
    document.documentElement.dataset.previousSequence = safePacket?.previousStep
      ? String(safePacket.previousStep.sequence ?? "")
      : "";
    const result = renderer({state:safePacket.step.state,previousState:safePacket.previousStep?.state ?? null,
      playback:safePacket.playback,environment:safePacket.environment});
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
