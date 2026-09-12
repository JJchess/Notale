import { createServer, type Server } from "node:http";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import type { AgentToolOutput } from "../core/agent.js";

const contentTypes: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json", ".wasm": "application/wasm", ".zip": "application/zip", ".whl": "application/zip", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
let browserPromise: Promise<Browser> | undefined;
const serverPromises = new Map<string, Promise<{ server: Server; origin: string }>>();
let leases = 0;

async function exists(file: string): Promise<boolean> { try { await access(file); return true; } catch { return false; } }

async function chromiumPath(): Promise<string | undefined> {
  const configured = process.env.NOTALE_CHROMIUM_PATH;
  if (configured && await exists(configured)) return configured;
  const packaged = chromium.executablePath();
  if (await exists(packaged)) return packaged;
  const cache = path.join(homedir(), ".cache", "ms-playwright");
  try {
    const names = (await readdir(cache)).filter((name) => name.startsWith("chromium-")).sort().reverse();
    for (const name of names) {
      for (const relative of ["chrome-linux64/chrome", "chrome-linux/chrome"]) {
        const candidate = path.join(cache, name, relative);
        if (await exists(candidate)) return candidate;
      }
    }
  } catch { /* reported by launch below */ }
  return undefined;
}

async function browser(): Promise<Browser> {
  browserPromise ??= chromiumPath().then((executablePath) => chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) }));
  return browserPromise;
}

async function staticServer(root: string): Promise<{ server: Server; origin: string }> {
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

export async function visualCheck(pagesDir: string, pageName: string): Promise<AgentToolOutput> {
  const target = path.resolve(pagesDir, pageName);
  if (path.dirname(target) !== path.resolve(pagesDir)) throw new Error("Check page must be a root page file");
  const [{ origin }, activeBrowser] = await Promise.all([staticServer(pagesDir), browser()]);
  const page = await activeBrowser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (request) => errors.push(`${request.failure()?.errorText ?? "request failed"}: ${request.url()}`));
  try {
    await page.goto(`${origin}/${encodeURIComponent(pageName)}`, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(150);
    if (await page.locator("#runtime-status").count()) {
      await page.waitForFunction(() => document.querySelector("#runtime-status")?.textContent !== "Python 准备中", undefined, { timeout: 30_000 });
      const runtimeStatus = await page.locator("#runtime-status").textContent();
      if (runtimeStatus?.includes("失败")) errors.push(runtimeStatus);
    }
    const metrics = await page.evaluate(() => {
      const stage = document.querySelector<HTMLElement>("#stage");
      const rect = stage?.getBoundingClientRect();
      const deck = (window as typeof window & { Deck?: { getState(): { maximum: number }; setStep(step: number): number } }).Deck;
      return { documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight, stage: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null, maximumStep: deck?.getState().maximum ?? 0 };
    });
    const initial = await page.screenshot({ type: "png" });
    let final = initial;
    if (metrics.maximumStep > 0) {
      await page.evaluate((step) => (window as typeof window & { Deck: { setStep(value: number): number } }).Deck.setStep(step), metrics.maximumStep);
      await page.waitForTimeout(80);
      final = await page.screenshot({ type: "png" });
      if (initial.equals(final)) errors.push("分步状态没有产生可见变化");
    }
    if (metrics.documentWidth > 1600 || metrics.documentHeight > 900) errors.push(`页面越界 ${metrics.documentWidth}×${metrics.documentHeight}`);
    if (!metrics.stage) errors.push("缺少 #stage");
    const directory = path.join(path.dirname(pagesDir), ".checks");
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, `${path.basename(pageName, ".html")}-initial.png`), initial);
    if (metrics.maximumStep > 0) await writeFile(path.join(directory, `${path.basename(pageName, ".html")}-final.png`), final);
    return {
      text: `${errors.length ? "失败" : "通过"}：1600×900 浏览器渲染；文档 ${metrics.documentWidth}×${metrics.documentHeight}；分步 ${metrics.maximumStep}；${errors.join("；") || "无运行、资源或页面越界错误"}`,
      images: [`data:image/png;base64,${initial.toString("base64")}`, ...(metrics.maximumStep > 0 ? [`data:image/png;base64,${final.toString("base64")}`] : [])],
    };
  } finally { await page.close(); }
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
