import type { CanvasInstance } from '../domain/canvas-instances.js';
import type { Slide } from '../domain/model.js';
import type { SceneScalar } from '../domain/scene-schema.js';
type Values = Record<string, SceneScalar>;
type Factory = (
  document: object,
  deck: object,
  initial: Values,
  view: { read?: () => Values },
) => void;
declare global {
  interface Window {
    __NOTALE_CANVAS_FACTORIES__?: Record<string, Factory>;
  }
}
export function canvasInstanceController(slide: Slide) {
  const running = new Map<string, { read: () => Values; stop: () => void }>(),
    retained = new Map<string, Values>();
  function start() {
    for (const [rootId, instance] of Object.entries(slide.canvasInstances ?? {})) {
      if (running.has(rootId)) continue;
      const root = document.querySelector<HTMLElement>(`[data-notale-id="${CSS.escape(rootId)}"]`),
        factory = window.__NOTALE_CANVAS_FACTORIES__?.[rootId];
      if (!root || !factory) continue;
      root.lang = instance.lang;
      const get = (key: string) =>
        root.querySelector<HTMLElement>(`[data-notale-id="${CSS.escape(instance.members[key])}"]`)!;
      const presets = [get('preset-0'), get('preset-1'), get('preset-2')];
      const localDocument: Record<string, unknown> = {
        getElementById: get,
        querySelectorAll: (selector: string) => (selector === '.preset-btn' ? presets : []),
      };
      const drawings = new Map<HTMLCanvasElement, (ctx: CanvasRenderingContext2D) => void>();
      const token = (name: string) => getComputedStyle(root).getPropertyValue(name).trim();
      const draw = (
        canvas: HTMLCanvasElement,
        callback: (ctx: CanvasRenderingContext2D) => void,
      ) => {
        const width = canvas.offsetWidth,
          height = canvas.offsetHeight;
        if (!width || !height) return;
        const scale = canvas.getBoundingClientRect().width / width;
        const ratio = Math.max(1, Math.min(2, (window.devicePixelRatio || 1) * scale));
        canvas.width = Math.max(1, Math.round(width * ratio));
        canvas.height = Math.max(1, Math.round(height * ratio));
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        callback(ctx);
      };
      const deck = {
        token,
        init: () => {},
        autofit: (canvas: HTMLCanvasElement, callback: (ctx: CanvasRenderingContext2D) => void) => {
          drawings.set(canvas, callback);
          draw(canvas, callback);
        },
      };
      const listeners: Array<{
        node: HTMLElement;
        type: string;
        callback: EventListenerOrEventListenerObject;
        options?: boolean | AddEventListenerOptions;
      }> = [];
      const members = Object.values(instance.members)
        .map((id) => root.querySelector<HTMLElement>(`[data-notale-id="${CSS.escape(id)}"]`)!)
        .filter(Boolean);
      const originals = members.map((node) => ({
        node,
        descriptor: Object.getOwnPropertyDescriptor(node, 'addEventListener'),
        method: node.addEventListener,
      }));
      const view: { read?: () => Values } = {};
      try {
        for (const { node, method } of originals)
          Object.defineProperty(node, 'addEventListener', {
            configurable: true,
            value: (
              type: string,
              callback: EventListenerOrEventListenerObject,
              options?: boolean | AddEventListenerOptions,
            ) => {
              listeners.push({ node, type, callback, options });
              method.call(node, type, callback, options);
            },
          });
        factory(
          localDocument,
          deck,
          retained.get(rootId) ?? slide.scenes?.find((scene) => scene.id === rootId)?.values ?? {},
          view,
        );
      } finally {
        for (const { node, descriptor } of originals)
          if (descriptor) Object.defineProperty(node, 'addEventListener', descriptor);
          else delete (node as any).addEventListener;
      }
      const read = view.read!;
      const sync = () => {
        const values = read();
        for (const [key, field] of [
          ['rho-slider', 'rho'],
          ['m-slider', 'M'],
          ['eps-slider', 'eps'],
        ])
          (get(key) as HTMLInputElement).value = String(values[field]);
        for (const preset of presets) {
          const active = Math.abs(Number(preset.dataset.rho) - Number(values.rho)) < 0.05;
          preset.classList.toggle('active', active);
          const color =
            Number(preset.dataset.rho) > 0.5
              ? token('--focus') || '#b83d0b'
              : token('--model') || '#17628e';
          Object.assign(preset.style, {
            backgroundColor: active ? color : 'transparent',
            color: active ? '#fff' : token('--text') || '#142630',
            borderColor: active ? color : token('--rule') || '#a8b7bf',
          });
        }
      };
      for (const node of [
        get('rho-slider'),
        get('m-slider'),
        get('eps-slider'),
        get('resample'),
        ...presets,
      ]) {
        const type = node.tagName === 'INPUT' ? 'input' : 'click';
        node.addEventListener(type, sync);
        listeners.push({ node, type, callback: sync });
      }
      sync();
      let frame = 0;
      const redraw = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          for (const [canvas, callback] of drawings) draw(canvas, callback);
        });
      };
      const resize = new ResizeObserver(redraw);
      for (const canvas of drawings.keys()) resize.observe(canvas);
      window.addEventListener('resize', redraw);
      (window.__NOTALE_SCENES__ ??= {})[rootId] = read;
      running.set(rootId, {
        read,
        stop: () => {
          cancelAnimationFrame(frame);
          resize.disconnect();
          window.removeEventListener('resize', redraw);
          for (const { node, type, callback, options } of listeners)
            node.removeEventListener(type, callback, options);
          drawings.clear();
          delete window.__NOTALE_SCENES__?.[rootId];
        },
      });
    }
  }
  const stop = () => {
    for (const [id, controller] of running) {
      retained.set(id, controller.read());
      controller.stop();
    }
    running.clear();
  };
  const observer = new MutationObserver(() => {
    for (const [id, controller] of running)
      if (!document.querySelector(`[data-notale-id="${CSS.escape(id)}"]`)) {
        controller.stop();
        running.delete(id);
        retained.delete(id);
      }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', start);
  return { start, stop };
}
