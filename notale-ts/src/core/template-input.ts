import { mkdir, readFile, writeFile, rename, cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { inspectPptx, digest } from './pptx-template.js';

export class TemplateInputs {
  constructor(readonly runsRoot: string) {}
  async file(id: string): Promise<string> {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('模板 ID 无效');
    const file = path.resolve(this.runsRoot, '.templates', id + '.pptx');
    const bytes = await readFile(file);
    if (digest(bytes) !== id) throw new Error('模板输入校验失败');
    return file;
  }
  async save(name: string, bytes: Buffer) {
    if (!/\.pptx$/i.test(name)) throw new Error('仅支持 .pptx 模板');
    inspectPptx(bytes);
    const id = digest(bytes), root = path.resolve(this.runsRoot, '.templates');
    await mkdir(root, { recursive: true });
    const temporary = path.join(root, randomUUID() + '.tmp');
    try { await writeFile(temporary, bytes); await rename(temporary, path.join(root, id + '.pptx')); }
    finally { await rm(temporary, { force: true }); }
    return { id, name: path.basename(name).slice(0, 200), sha256: id };
  }
  async snapshot(id: string, runDirectory: string) {
    const source = await this.file(id), directory = path.join(runDirectory, 'input');
    await mkdir(directory, { recursive: true }); await cp(source, path.join(directory, 'template.pptx'));
  }
}
