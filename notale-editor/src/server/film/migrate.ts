import { createHash } from 'node:crypto';
import { createReadStream, constants } from 'node:fs';
import { mkdir, readdir, lstat, readFile, writeFile, copyFile, rename, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { scopeDirectory } from './config.js';

interface MigrationOptions { from: string; dataDir: string; scope: string; actor: string; apply?: boolean }
async function hash(file: string) { const h = createHash('sha256'); for await (const chunk of createReadStream(file)) h.update(chunk); return h.digest('hex'); }
/** Copy once, verify, then publish. Originals and database revisions are never modified. */
export async function migrateFilm(options: MigrationOptions) {
  if (!options.scope || !options.actor) throw Error('迁移必须指定原工作区和操作者');
  const from = await realpath(options.from), target = scopeDirectory(options.dataDir, options.scope);
  if (target === from || target.startsWith(from + path.sep)) throw Error('迁移目标不能位于原数据目录内');
  const files: { path: string; bytes: number; sha256: string; outputHash: string; converted?: string }[] = [];
  async function visit(relative: string) {
    const file = path.join(from, relative), info = await lstat(file).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
    if (!info) return;
    if (info.isSymbolicLink()) throw Error('迁移拒绝符号链接：' + relative);
    if (info.isDirectory()) { for (const item of await readdir(file)) await visit(relative + '/' + item); return; }
    if (!info.isFile()) throw Error('迁移仅接受普通文件：' + relative);
    const sha256 = await hash(file); let converted: string | undefined;
    if (/^exports\/[a-f0-9-]{36}\/job\.json$/.test(relative)) {
      const record = JSON.parse(await readFile(file, 'utf8'));
      if (![1, 2].includes(record.version) || record.id !== relative.split('/')[1]) throw Error('无效导出任务：' + relative);
      if (record.version === 2 && (record.scope !== options.scope || record.actor !== options.actor)) throw Error('任务归属不匹配：' + relative);
      converted = JSON.stringify({ ...record, version: 2, scope: options.scope, actor: options.actor }, null, 2);
    }
    files.push({ path: relative, bytes: info.size, sha256, outputHash: converted ? createHash('sha256').update(converted).digest('hex') : sha256, ...(converted ? { converted } : {}) });
  }
  for (const name of ['assets', 'fonts', 'exports', 'fixtures']) await visit(name);
  const summary = { from, target, scope: options.scope, actor: options.actor, files: files.length, bytes: files.reduce((n, f) => n + f.bytes, 0) };
  if (!options.apply) return { ...summary, applied: false, alreadyApplied: false };
  const previous = await readFile(path.join(target, 'migration.json'), 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
  if (previous) {
    if (previous.from !== from || previous.scope !== options.scope || previous.actor !== options.actor || previous.entries.length !== files.length) throw Error('已有迁移记录与来源不一致');
    for (const file of files) {
      const entry = previous.entries.find((item: { path: string }) => item.path === file.path);
      if (!entry || entry.sha256 !== file.sha256 || await hash(path.join(target, file.path)) !== file.outputHash) throw Error('迁移后文件已变化：' + file.path);
    }
    return { ...summary, applied: true, alreadyApplied: true };
  }
  if (await lstat(target).catch(() => undefined)) throw Error('目标工作区已存在；请选择空目标，不能覆盖正在使用的数据');
  const staging = target + '.migration'; await mkdir(staging, { recursive: true });
  for (const file of files) {
    const source = path.join(from, file.path), output = path.join(staging, file.path);
    if (await hash(source) !== file.sha256) throw Error('迁移期间源文件变化：' + file.path);
    await mkdir(path.dirname(output), { recursive: true });
    if (file.converted !== undefined) await writeFile(output, file.converted);
    else await copyFile(source, output, constants.COPYFILE_FICLONE);
    if (await hash(source) !== file.sha256 || await hash(output) !== file.outputHash) throw Error('迁移校验失败：' + file.path);
  }
  await writeFile(path.join(staging, 'migration.json'), JSON.stringify({ ...summary, entries: files.map(({ converted, ...item }) => item) }, null, 2));
  await rename(staging, target);
  return { ...summary, applied: true, alreadyApplied: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { from: { type: 'string' }, data: { type: 'string' }, scope: { type: 'string' }, actor: { type: 'string' }, apply: { type: 'boolean' } } });
  if (!values.from || !values.data || !values.scope || !values.actor) throw Error('Usage: migrate --from DIR --data DIR --scope SCOPE --actor ACTOR [--apply]');
  console.log(JSON.stringify(await migrateFilm({ from: values.from, dataDir: values.data, scope: values.scope, actor: values.actor, apply: values.apply }), null, 2));
}
