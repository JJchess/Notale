import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { DomainError, invariant } from '../../domain/model.js';
import { MAX_MEDIA_BYTES, sniffBytes } from './pi/index.js';

/** Documents and videos the author attaches to an AI message (images still go inline). Uploaded on
 * their own, before the message, so a large file never rides in the message body; the message then
 * names them by id and the turn copies them into the session's workspace. DOCX and PPTX become PDF
 * here (LibreOffice), so the agent only reads PDFs and videos -- the same as notale-ts's Istar. */
export type UploadKind = 'pdf' | 'docx' | 'pptx' | 'video';
export interface Upload { id: string; name: string; kind: UploadKind; size: number }
const KINDS: Record<string, UploadKind> = { '.pdf': 'pdf', '.docx': 'docx', '.pptx': 'pptx', '.mp4': 'video', '.mov': 'video', '.webm': 'video' };
const ID = /^[0-9a-f-]{36}$/;
const run = promisify(execFile);

export class AiUploads {
  constructor(readonly root = resolve(process.env.EDITOR_AI_UPLOAD_DIR || '.local/ai-uploads')) {}
  private dir(documentId: string, id: string) {
    invariant(ID.test(id) && /^[\w-]{1,100}$/.test(documentId), 'AI_UPLOAD_NOT_FOUND', '附件不存在', 404);
    return join(this.root, documentId, id);
  }
  async save(documentId: string, name: string, bytes: Buffer): Promise<Upload> {
    const kind = KINDS[extname(name).toLowerCase()];
    invariant(kind, 'AI_UPLOAD_TYPE', '只能附 PDF、DOCX、PPTX 或视频（MP4、MOV、WebM）', 400);
    invariant(bytes.length > 0 && bytes.length <= MAX_MEDIA_BYTES, 'AI_UPLOAD_SIZE', '附件不能超过 100 MB', 413);
    // The bytes, not the name, decide what a PDF or a video is.
    if (kind === 'pdf' || kind === 'video') invariant(sniffBytes(new Uint8Array(bytes.subarray(0, 512))).kind === kind, 'AI_UPLOAD_TYPE', '文件内容与扩展名不符', 400);
    const upload: Upload = { id: randomUUID(), name: name.replace(/[\x00-\x1f/\\]/g, '').slice(0, 200) || 'file', kind, size: bytes.length };
    const dir = this.dir(documentId, upload.id), file = join(dir, `original${extname(name).toLowerCase()}`);
    await mkdir(dir, { recursive: true });
    await writeFile(file, bytes);
    if (kind === 'docx' || kind === 'pptx') {
      await run('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', dir, file], { timeout: 180_000 })
        .catch(() => { throw new DomainError('AI_UPLOAD_CONVERT', '文档转换失败', 422); });
    }
    await writeFile(join(dir, 'meta.json'), JSON.stringify(upload));
    return upload;
  }
  /** What the agent reads: the file itself, or the PDF a document became. */
  async resolve(documentId: string, id: string): Promise<{ path: string; name: string; kind: string }> {
    const dir = this.dir(documentId, id);
    const meta = await readFile(join(dir, 'meta.json'), 'utf8').then(text => JSON.parse(text) as Upload, () => { throw new DomainError('AI_UPLOAD_NOT_FOUND', '附件不存在', 404); });
    if (meta.kind === 'docx' || meta.kind === 'pptx') return { path: join(dir, 'original.pdf'), name: meta.name, kind: 'pdf' };
    return { path: join(dir, `original${extname(meta.name).toLowerCase()}`), name: meta.name, kind: meta.kind };
  }
}
