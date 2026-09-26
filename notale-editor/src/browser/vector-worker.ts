import { outlineText } from './vector-font.js';
import { combinePaths } from './vector-kernel.js';
self.onmessage = async (e: MessageEvent) => {
  const { id, url, items, action, amount } = e.data;
  try {
    const result =
      action === 'text-outline'
        ? outlineText(
            new Uint8Array(e.data.font),
            e.data.text,
            e.data.size,
            e.data.x,
            e.data.y,
            e.data.spacing,
            e.data.anchor,
          )
        : await combinePaths(url, items, action, amount);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
