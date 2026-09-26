import { createServer, type Server } from "node:http";
import { access, readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";

const contentTypes: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json", ".wasm": "application/wasm", ".zip": "application/zip", ".whl": "application/zip", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
let browserPromise: Promise<Browser> | undefined;
const serverPromises = new Map<string, Promise<{ server: Server; origin: string }>>();
let leases = 0;

async function exists(file: string): Promise<boolean> { try { await access(file); return true; } catch { return false; } }

async function chromiumPath(): Promise<string | undefined> {
  const configured = process.env.NOTALE_CHROMIUM_PATH;
  if (configured && await exists(configured)) return configured;
  const packaged = chromium.executablePath();
  // Python's headless launch uses headless-shell. Forcing the full Chrome
  // executable changes text rasterization even at the same Chromium revision.
  const bundledShell = path.dirname(path.dirname(packaged)).replace(/chromium-(\d+)$/, 'chromium_headless_shell-$1');
  for (const relative of ['chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux/headless_shell']) {
    if (await exists(path.join(bundledShell, relative))) return undefined;
  }
  if (await exists(packaged)) return packaged;
  const cache = path.join(homedir(), ".cache", "ms-playwright");
  try {
    const installed = await readdir(cache);
    const shells = installed.filter(name => name.startsWith('chromium_headless_shell-')).sort((a, b) => Number(b.split('-').at(-1)) - Number(a.split('-').at(-1)));
    for (const name of shells) for (const relative of ['chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux/headless_shell']) {
      const candidate = path.join(cache, name, relative);
      if (await exists(candidate)) return candidate;
    }
    const names = installed.filter((name) => name.startsWith("chromium-")).sort((a, b) => Number(b.split('-').at(-1)) - Number(a.split('-').at(-1)));
    for (const name of names) {
      for (const relative of ["chrome-linux64/chrome", "chrome-linux/chrome"]) {
        const candidate = path.join(cache, name, relative);
        if (await exists(candidate)) return candidate;
      }
    }
  } catch { /* reported by launch below */ }
  return undefined;
}

export async function browser(): Promise<Browser> {
  browserPromise ??= chromiumPath().then((executablePath) => chromium.launch({ headless: true, args: ["--allow-file-access-from-files"], ...(executablePath ? { executablePath } : {}) }));
  return browserPromise;
}

export async function staticServer(root: string): Promise<{ server: Server; origin: string }> {
  const resolved = path.resolve(root);
  let current = serverPromises.get(resolved);
  if (current) return current;
  current = new Promise((resolve, reject) => {
    const server = createServer(async (request, response) => {
      try {
        const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://local").pathname);
        const file = path.resolve(resolved, `.${pathname}`);
        if (file !== resolved && !file.startsWith(`${resolved}${path.sep}`)) throw new Error("invalid path");
        response.setHeader("content-type", contentTypes[path.extname(file)] ?? "application/octet-stream");
        response.end(await readFile(file));
      } catch { response.statusCode = 404; response.end("not found"); }
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") return reject(new Error("visual check server did not bind"));
      resolve({ server, origin: `http://127.0.0.1:${address.port}` });
    });
  });
  serverPromises.set(resolved, current);
  return current;
}

export async function closeVisualChecker(): Promise<void> {
  if (browserPromise) await (await browserPromise).close();
  await Promise.all([...serverPromises.values()].map(async (entry) => { const { server } = await entry; await new Promise<void>((resolve) => server.close(() => resolve())); }));
  browserPromise = undefined;
  serverPromises.clear();
}

export function acquireVisualChecker(): () => Promise<void> {
  leases += 1;
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    leases -= 1;
    if (leases === 0) await closeVisualChecker();
  };
}
