import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const RUN = /^[a-z0-9][a-z0-9-]{7,80}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function editorRequest(runId: string, body: unknown): { runId: string; session: string } | undefined {
  if (!RUN.test(runId) || !body || typeof body !== "object" || Array.isArray(body)) return;
  const session = (body as Record<string, unknown>).session;
  return typeof session === "string" && UUID.test(session) ? { runId, session } : undefined;
}

export function editorOrigins(env: Readonly<Record<string, string | undefined>> = process.env) {
  const editor = (env.EDITOR_URL ?? "http://127.0.0.1:4312").replace(/\/$/, "");
  return {
    editor,
    publicEditor: (env.EDITOR_PUBLIC_URL ?? editor).replace(/\/$/, ""),
    api: (env.NOTALE_API_URL ?? "http://127.0.0.1:4321").replace(/\/$/, ""),
    token: env.NOTALE_API_TOKEN,
  };
}

type Options = { linksFile: string; editor: string; api: string; token?: string; fetch?: typeof fetch };
// This local file registry serves one Viewer process. A shared queue also protects different runs:
// a per-run lock alone would still let their read/modify/write cycles overwrite one another.
const queues = new Map<string, Promise<void>>();

async function readLinks(file: string): Promise<Record<string, string>> {
  let raw: string;
  try { raw = await readFile(file, "utf8"); }
  catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error("无法读取编辑器关联记录", { cause });
  }
  let links: unknown;
  try { links = JSON.parse(raw); }
  catch (cause) { throw new Error("编辑器关联记录已损坏，请先恢复记录", { cause }); }
  if (!links || typeof links !== "object" || Array.isArray(links) ||
    Object.entries(links).some(([run, id]) => !RUN.test(run) || typeof id !== "string" || !UUID.test(id))) {
    throw new Error("编辑器关联记录格式不正确，请先恢复记录");
  }
  return links as Record<string, string>;
}

async function writeLinks(file: string, links: Record<string, string>) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(links, null, 1), { flag: "wx" });
    await rename(temporary, file);
  } finally { await unlink(temporary).catch(() => {}); }
}

/** Keep hand-edited documents on repeated opens. A failed lookup is never evidence of deletion. */
export async function openEditorDocument(runId: string, options: Options): Promise<string> {
  if (!RUN.test(runId)) throw new Error("讲义编号不正确");
  const key = path.resolve(options.linksFile), previous = queues.get(key) ?? Promise.resolve();
  const operation = previous.then(async () => {
    const request = options.fetch ?? fetch, known = await readLinks(key);
    const id = known[runId];
    if (id) {
      const existing = await request(`${options.editor}/api/documents/${id}`, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
      if (existing.ok) return id;
      if (existing.status !== 404) throw new Error(`编辑器暂时无法读取原讲义（${existing.status}）`);
    }
    const archive = await request(`${options.api}/v1/runs/${encodeURIComponent(runId)}/download?format=notale`, {
      cache: "no-store", signal: AbortSignal.timeout(30_000),
      ...(options.token ? { headers: { authorization: `Bearer ${options.token}` } } : {}),
    });
    if (!archive.ok) throw new Error(`讲义包取不到（${archive.status}）`);
    const imported = await request(`${options.editor}/api/import`, {
      method: "POST", headers: { "content-type": "application/octet-stream" },
      body: await archive.arrayBuffer(), signal: AbortSignal.timeout(30_000),
    });
    const body: unknown = await imported.json().catch(() => undefined);
    const document = body && typeof body === "object" ? (body as Record<string, unknown>).document : undefined;
    const importedId = document && typeof document === "object" ? (document as Record<string, unknown>).id : undefined;
    if (!imported.ok || typeof importedId !== "string" || !UUID.test(importedId)) throw new Error(`编辑器没能导入这份讲义（${imported.status}）`);
    await writeLinks(key, { ...known, [runId]: importedId });
    return importedId;
  });
  const settled = operation.then(() => {}, () => {});
  queues.set(key, settled);
  try { return await operation; }
  finally { if (queues.get(key) === settled) queues.delete(key); }
}
