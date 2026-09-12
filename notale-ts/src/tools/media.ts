import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import type { ToolDefinition } from "../adapters/models/chat-model.js";
import type { AgentToolOutput } from "../core/agent.js";

export const mediaToolDefinitions: ToolDefinition[] = [
  { type: "function", function: { name: "ImageSearch", description: "实时搜索并下载公开图片候选；返回来源、本地相对路径和实际图片。", parameters: { type: "object", properties: { query: { anyOf: [{ type: "string" }, { type: "array", items: { type: "string" }, minItems: 1 }] }, count: { type: "integer", minimum: 1, maximum: 4 } }, required: ["query"], additionalProperties: false } } },
  { type: "function", function: { name: "ImageGen", description: "生成原创教学插图并保存为本地讲义资源；真实证据图片应使用 ImageSearch。", parameters: { type: "object", properties: { prompt: { type: "string" }, n: { type: "integer", minimum: 1, maximum: 2 } }, required: ["prompt"], additionalProperties: false } } },
];

function queriesOf(value: unknown): string[] {
  const values = typeof value === "string" ? [value] : value;
  if (!Array.isArray(values) || !values.length || values.some((row) => typeof row !== "string" || !row.trim())) throw new Error("query 必须是非空字符串或字符串数组");
  return values as string[];
}

function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a! >= 224 || (a === 100 && b! >= 64 && b! <= 127) || (a === 169 && b === 254) || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)));
  }
  const value = address.toLowerCase();
  if (value.startsWith("::ffff:")) return publicAddress(value.slice(7));
  return isIP(address) === 6 && value !== "::" && value !== "::1" && !value.startsWith("fc") && !value.startsWith("fd") && !/^fe[89ab]/.test(value);
}

async function assertPublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error("图片必须来自无凭据的公开 HTTP(S) URL");
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((row) => !publicAddress(row.address))) throw new Error("图片地址解析到非公网地址");
  return url;
}

function imageType(bytes: Uint8Array, contentType = ""): { extension: string; mime: string } {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { extension: ".png", mime: "image/png" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { extension: ".jpg", mime: "image/jpeg" };
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return { extension: ".webp", mime: "image/webp" };
  if (String.fromCharCode(...bytes.slice(0, 3)) === "GIF") return { extension: ".gif", mime: "image/gif" };
  throw new Error(`不支持或无效的图片格式：${contentType || "unknown"}`);
}

async function fetchBytes(raw: string, timeoutMs = 60_000): Promise<{ bytes: Uint8Array; finalUrl: string; mime: string; extension: string }> {
  let url = raw;
  for (let redirects = 0; redirects < 6; redirects += 1) {
    await assertPublicUrl(url);
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "Notale-media/1.0" } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("图片重定向缺少 Location");
      url = new URL(location, url).href;
      continue;
    }
    if (!response.ok) throw new Error(`图片下载 HTTP ${response.status}`);
    const size = Number(response.headers.get("content-length") ?? 0);
    if (size > 20_000_000) throw new Error("图片超过 20 MB");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > 20_000_000) throw new Error("图片超过 20 MB");
    const type = imageType(bytes, response.headers.get("content-type") ?? "");
    return { bytes, finalUrl: url, ...type };
  }
  throw new Error("图片重定向过多");
}

async function privateOutput(pagesDir: string, owner: string, kind: string): Promise<string> {
  const parent = path.join(pagesDir, "assets", "img");
  await mkdir(parent, { recursive: true });
  const output = path.join(parent, `${owner}-${kind}-${randomUUID().slice(0, 12)}`);
  await mkdir(output, { recursive: false });
  return output;
}

async function imageSearch(args: Record<string, unknown>, pagesDir: string, owner: string): Promise<AgentToolOutput> {
  const queries = queriesOf(args.query);
  const count = Math.min(4, Math.max(1, Number(args.count ?? 3)));
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("ImageSearch 需要 GEMINI_API_KEY");
  const output = await privateOutput(pagesDir, owner, "search");
  const schema = {
    type: "object",
    properties: {
      queries: {
        type: "array",
        items: {
          type: "object",
          properties: {
            query_index: { type: "integer" },
            results: { type: "array", items: { type: "object", properties: { title: { type: "string" }, page_url: { type: "string" }, image_url: { type: "string" } }, required: ["title", "page_url", "image_url"] } },
          },
          required: ["query_index", "results"],
        },
      },
    },
    required: ["queries"],
  };
  const prompt = `Search the web now for each teaching image need. Return up to ${count} real candidates per need with a source page and direct PNG/JPEG/WebP/GIF URL. Prefer original or clearly attributable sources. Never invent URLs. Preserve query_index.\n${JSON.stringify(queries.map((query, query_index) => ({ query_index, query })))}`;
  const request = { contents: [{ role: "user", parts: [{ text: prompt }] }], tools: [{ google_search: {} }], toolConfig: { includeServerSideToolInvocations: true }, generationConfig: { thinkingConfig: { thinkingLevel: "low" }, responseMimeType: "application/json", responseJsonSchema: schema } };
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent", { method: "POST", signal: AbortSignal.timeout(120_000), headers: { "x-goog-api-key": apiKey, "content-type": "application/json" }, body: JSON.stringify(request) });
  const raw = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean; toolCall?: unknown }> }; groundingMetadata?: { webSearchQueries?: unknown[] } }> };
  await writeFile(path.join(output, "provider.json"), `${JSON.stringify({ model: "gemini-3.8-flash", status: response.status, response: raw }, null, 2)}\n`);
  if (!response.ok) throw new Error(`ImageSearch HTTP ${response.status}`);
  const candidate = raw.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  if (!parts.some((part) => part.toolCall) && !candidate?.groundingMetadata?.webSearchQueries?.length) throw new Error("ImageSearch 没有可验证的 Google 搜索记录");
  const text = parts.filter((part) => !part.thought).map((part) => part.text ?? "").join("");
  const payload = JSON.parse(text) as { queries?: Array<{ query_index: number; results: Array<{ title: string; page_url: string; image_url: string }> }> };
  const rows: Array<Record<string, unknown>> = [];
  const images: string[] = [];
  for (const group of payload.queries ?? []) {
    for (const item of (group.results ?? []).slice(0, count)) {
      try {
        const downloaded = await fetchBytes(item.image_url);
        const filename = `${String(rows.length).padStart(2, "0")}${downloaded.extension}`;
        await writeFile(path.join(output, filename), downloaded.bytes);
        const relative = path.relative(pagesDir, path.join(output, filename)).split(path.sep).join("/");
        rows.push({ query_index: group.query_index, title: item.title, page_url: item.page_url, url: downloaded.finalUrl, path: relative });
        images.push(`data:${downloaded.mime};base64,${Buffer.from(downloaded.bytes).toString("base64")}`);
      } catch (error) {
        rows.push({ query_index: group.query_index, title: item.title, page_url: item.page_url, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  await writeFile(path.join(output, "attribution.json"), `${JSON.stringify(rows, null, 2)}\n`);
  return { text: JSON.stringify({ results: rows }), images: images.slice(0, 4) };
}

async function imageGenerate(args: Record<string, unknown>, pagesDir: string, owner: string): Promise<AgentToolOutput> {
  if (typeof args.prompt !== "string" || !args.prompt.trim()) throw new Error("prompt 不能为空");
  const apiKey = process.env.PARATERA_API_KEY;
  if (!apiKey) throw new Error("ImageGen 需要 PARATERA_API_KEY");
  const count = Math.min(2, Math.max(1, Number(args.n ?? 1)));
  const output = await privateOutput(pagesDir, owner, "generated");
  const response = await fetch("https://llmapi.paratera.com/v1/images/generations", { method: "POST", signal: AbortSignal.timeout(300_000), headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ model: "Doubao-Seedream-4.0", prompt: args.prompt, size: "2048x1152", n: count }) });
  const raw = await response.json() as { data?: Array<{ b64_json?: string; url?: string }> };
  if (!response.ok) throw new Error(`ImageGen HTTP ${response.status}`);
  const rows: Array<Record<string, string>> = [];
  const images: string[] = [];
  for (const [index, item] of (raw.data ?? []).entries()) {
    const downloaded = item.b64_json ? (() => { const bytes = new Uint8Array(Buffer.from(item.b64_json, "base64")); return { bytes, finalUrl: "provider-base64", ...imageType(bytes) }; })() : item.url ? await fetchBytes(item.url, 180_000) : undefined;
    if (!downloaded) continue;
    const filename = `image-${index + 1}${downloaded.extension}`;
    await writeFile(path.join(output, filename), downloaded.bytes);
    const relative = path.relative(pagesDir, path.join(output, filename)).split(path.sep).join("/");
    rows.push({ file: filename, path: relative, prompt: args.prompt, model: "Doubao-Seedream-4.0", size: "2048x1152" });
    images.push(`data:${downloaded.mime};base64,${Buffer.from(downloaded.bytes).toString("base64")}`);
  }
  if (!rows.length) throw new Error("ImageGen 没有返回图片");
  await writeFile(path.join(output, "illustrations.json"), `${JSON.stringify(rows, null, 2)}\n`);
  return { text: JSON.stringify(rows), images };
}

export async function executeMediaTool(name: string, args: Record<string, unknown>, pagesDir: string, owner: string): Promise<AgentToolOutput> {
  if (name === "ImageSearch") return imageSearch(args, pagesDir, owner);
  if (name === "ImageGen") return imageGenerate(args, pagesDir, owner);
  throw new Error(`Unknown media tool: ${name}`);
}
