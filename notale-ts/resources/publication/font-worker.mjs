import { parentPort } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import subsetFont from 'subset-font';
const fonts = new Map();
parentPort.on('message', async ({ source, digest, text }) => {
  try {
    const key = source + ':' + digest;
    if (!fonts.has(key)) {
      if (fonts.size >= 2) fonts.delete(fonts.keys().next().value);
      fonts.set(key, await readFile(source));
    }
    const result = await subsetFont(fonts.get(key), text, { targetFormat: 'woff2' });
    parentPort.postMessage({ result });
  } catch (error) { parentPort.postMessage({ error: String(error) }); }
});
