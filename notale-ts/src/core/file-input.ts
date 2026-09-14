/** Immutable uploads and per-task snapshots for content materials. */
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm, cp } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import sharp from 'sharp';
import { parseDocument, DomUtils } from 'htmlparser2';
export const inputLimits = { files: 10, bytes: 50 * 1024 * 1024, totalBytes: 200 * 1024 * 1024, pages: 200, ocrConcurrency: 2 };
export const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
export interface InputFile { id: string; name: string; mime: string; size: number; sha256: string; extension: string }
const types: Record<string, string> = { '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
export async function inspectInput(name: string, bytes: Buffer): Promise<string> {
  const extension = path.extname(name).toLowerCase();
  if (!types[extension] || !bytes.length || bytes.length > inputLimits.bytes) throw new Error('请选择不超过 50 MiB 的 PDF、DOCX、PNG、JPEG 或 WebP 文件');
  if (extension === '.pdf') { if (!bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error('文件内容不是 PDF'); }
  else if (extension === '.docx') {
    let size = 0, count = 0; const names = new Set<string>();
    const xml = unzipSync(bytes, { filter(file) {
      if (++count > 10000 || (size += file.originalSize) > 500 * 1024 * 1024 || names.has(file.name) || file.name.startsWith('/') || /[\\\x00-\x1f]/.test(file.name) || file.name.split('/').some(p => p === '..' || p === '.')) throw new Error('DOCX 包含不安全路径或超出解包限制');
      names.add(file.name); return /\.(xml|rels)$/.test(file.name);
    } });
    if (!xml['word/document.xml'] || !xml['[Content_Types].xml']) throw new Error('文件内容不是 DOCX');
    if ([...names].some(n => /vbaProject|activeX/i.test(n))) throw new Error('不支持含宏或 ActiveX 的文档');
    for (const [n, data] of Object.entries(xml)) {
      const text = strFromU8(data);
      if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('不支持文档 XML 实体');
      if (n.endsWith('.rels')) for (const relationship of DomUtils.findAll(node => node.name.split(':').at(-1) === 'Relationship', parseDocument(text, { xmlMode: true }).children)) {
        if (relationship.attribs.TargetMode === 'External' && !relationship.attribs.Type?.endsWith('/hyperlink')) throw new Error('请先将外部素材嵌入文档');
      }
    }
  } else {
    if (extension === '.png') for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = bytes.readUInt32BE(offset);
      if (bytes.toString('ascii', offset + 4, offset + 8) === 'acTL') throw new Error('不支持动态图像');
      offset += 12 + length;
    }
    const info = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
    if (!info.width || !info.height || info.pages && info.pages > 1 || info.format !== ({ '.jpg': 'jpeg', '.jpeg': 'jpeg', '.png': 'png', '.webp': 'webp' } as Record<string, string>)[extension]) throw new Error('图片格式不符或不是静态图片');
  }
  return extension;
}
export class FileInputs {
  constructor(readonly root: string) {}
  async get(id: string): Promise<{ metadata: InputFile; file: string }> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) throw new Error('资料 ID 无效');
    const dir = path.join(this.root, '.files', id), metadata = JSON.parse(await readFile(path.join(dir, 'metadata.json'), 'utf8')) as InputFile;
    const file = path.join(dir, 'original');
    if (hash(await readFile(file)) !== metadata.sha256) throw new Error('资料校验失败');
    return { metadata, file };
  }
  async save(name: string, bytes: Buffer): Promise<InputFile> {
    const extension = await inspectInput(name, bytes), id = randomUUID();
    const metadata = { id, name: path.basename(name).replace(/[\x00-\x1f]/g, '').slice(0, 200), extension, mime: types[extension]!, size: bytes.length, sha256: hash(bytes) };
    const dir = path.join(this.root, '.files', id), temporary = dir + '.tmp';
    await mkdir(temporary, { recursive: true });
    try { await writeFile(path.join(temporary, 'original'), bytes); await writeFile(path.join(temporary, 'metadata.json'), JSON.stringify(metadata)); await rename(temporary, dir); }
    finally { await rm(temporary, { recursive: true, force: true }); }
    return metadata;
  }
  async snapshot(ids: string[], directory: string): Promise<void> {
    if (ids.length > inputLimits.files || new Set(ids).size !== ids.length) throw new Error('最多选择 10 份资料，资料 ID 不能重复');
    const files = await Promise.all(ids.map(id => this.get(id)));
    if (files.reduce((n, f) => n + f.metadata.size, 0) > inputLimits.totalBytes) throw new Error('资料合计不能超过 200 MiB');
    const target = path.join(directory, 'input/files'); await mkdir(target, { recursive: true });
    for (const { metadata, file } of files) await cp(file, path.join(target, metadata.id + metadata.extension));
    await writeFile(path.join(target, 'index.json'), JSON.stringify(files.map(f => f.metadata)));
  }
}
