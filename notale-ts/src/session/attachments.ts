import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import { promisify } from 'node:util';
import type { Session } from './session.js';

const run = promisify(execFile);
export interface Attachment { id: string; name: string; mime: string; size: number; kind: 'pdf' | 'docx' | 'pptx' | 'image' }
const KINDS: Record<string, { kind: Attachment['kind']; mime: string }> = {
  '.pdf': { kind: 'pdf', mime: 'application/pdf' },
  '.docx': { kind: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  '.pptx': { kind: 'pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  '.png': { kind: 'image', mime: 'image/png' }, '.jpg': { kind: 'image', mime: 'image/jpeg' },
  '.jpeg': { kind: 'image', mime: 'image/jpeg' }, '.webp': { kind: 'image', mime: 'image/webp' },
};
export const ATTACHMENT_LIMITS = { files: 10, bytes: 50 * 1024 * 1024 };

/** What the author sent with a message, kept in the session until its role is known. Only the
 * formats the generator also accepts (pdf, docx, images) plus pptx (a template, or content). */
export async function saveAttachment(session: Session, name: string, bytes: Buffer): Promise<Attachment> {
  const found = KINDS[extname(name).toLowerCase()];
  if (!found) throw Object.assign(new Error(`不支持的文件类型：${name}（可用 PDF、DOCX、PPTX、PNG、JPG、WebP）`), { status: 400 });
  if (bytes.length > ATTACHMENT_LIMITS.bytes) throw Object.assign(new Error(`文件超过 50 MB：${name}`), { status: 400 });
  const attachment: Attachment = { id: randomUUID(), name: name.replace(/[\x00-\x1f/\\]/g, '').slice(0, 200), mime: found.mime, size: bytes.length, kind: found.kind };
  const dir = join(session.dir, 'files', attachment.id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'original'), bytes);
  await writeFile(join(dir, 'meta.json'), JSON.stringify(attachment));
  return attachment;
}
export async function loadAttachment(session: Session, id: string) {
  const dir = join(session.dir, 'files', id);
  const meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8')) as Attachment;
  return { meta, file: join(dir, 'original') };
}

/** What the model gets to see of a file before deciding what it is for: enough to tell a template
 * (little text, a layout) from material (content) from a style reference (a picture). */
export interface Preview { id: string; name: string; kind: Attachment['kind']; summary: string; image?: { mime: string; data: string } }
const clip = (text: string, limit: number) => { const flat = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim(); return flat.length > limit ? flat.slice(0, limit) + '…' : flat; };
const xmlText = (xml: string) => xml.replace(/<a:br\/>|<\/w:p>|<\/a:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
export async function preview(session: Session, id: string): Promise<Preview> {
  const { meta, file } = await loadAttachment(session, id);
  const base = { id, name: meta.name, kind: meta.kind };
  try {
    if (meta.kind === 'image') return { ...base, summary: `图片，${Math.round(meta.size / 1024)} KB`, image: { mime: meta.mime, data: (await readFile(file)).toString('base64') } };
    if (meta.kind === 'pdf') {
      const info = (await run('pdfinfo', [file])).stdout, pages = /Pages:\s+(\d+)/.exec(info)?.[1] ?? '?';
      const text = (await run('pdftotext', ['-f', '1', '-l', '3', '-layout', file, '-'], { maxBuffer: 8 << 20 })).stdout;
      const shot = await run('pdftoppm', ['-f', '1', '-l', '1', '-png', '-scale-to', '800', file], { encoding: 'buffer', maxBuffer: 16 << 20 }).then(r => r.stdout as unknown as Buffer).catch(() => undefined);
      return { ...base, summary: `PDF，${pages} 页。前 3 页文字：\n${clip(text, 1500) || '（没有可提取的文字，可能是扫描件）'}`, ...(shot?.length ? { image: { mime: 'image/png', data: shot.toString('base64') } } : {}) };
    }
    if (meta.kind === 'docx') {
      const xml = (await run('unzip', ['-p', file, 'word/document.xml'], { maxBuffer: 32 << 20 })).stdout;
      return { ...base, summary: `Word 文档。开头文字：\n${clip(xmlText(xml), 1500)}` };
    }
    // PPTX: slide count, how much text each slide carries, how many pictures -- a template is mostly
    // layout with placeholder text; a deck to turn into a lecture is mostly content.
    const listing = (await run('unzip', ['-Z1', file], { maxBuffer: 8 << 20 })).stdout.split('\n');
    const slides = listing.filter(entry => /^ppt\/slides\/slide\d+\.xml$/.test(entry)).sort((a, b) => Number(/(\d+)\.xml/.exec(a)![1]) - Number(/(\d+)\.xml/.exec(b)![1]));
    const media = listing.filter(entry => entry.startsWith('ppt/media/')).length;
    const texts = await Promise.all(slides.slice(0, 6).map(async slide => clip(xmlText((await run('unzip', ['-p', file, slide], { maxBuffer: 8 << 20 })).stdout), 240)));
    const chars = texts.reduce((sum, text) => sum + text.length, 0);
    return { ...base, summary: `PPTX，${slides.length} 张幻灯片，${media} 个图片素材，前 ${texts.length} 张平均 ${texts.length ? Math.round(chars / texts.length) : 0} 字。\n` + texts.map((text, index) => `第 ${index + 1} 张：${text || '（无文字）'}`).join('\n') };
  } catch (cause) {
    return { ...base, summary: `（读不出内容：${cause instanceof Error ? cause.message : String(cause)}）` };
  }
}
