import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

export async function writeJson(file, value) {
  await ensureDir(path.dirname(file));
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temp, file);
}

export async function writeText(file, value) {
  await ensureDir(path.dirname(file));
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, value, 'utf8');
  await rename(temp, file);
}

export async function writeBinary(file, value) {
  await ensureDir(path.dirname(file));
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, value);
  await rename(temp, file);
}

export async function sha256File(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

export function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex');
}

export async function replaceDir(dir) {
  const resolved = path.resolve(dir);
  if (resolved === path.parse(resolved).root) throw new Error(`拒绝清空文件系统根目录: ${resolved}`);
  await rm(resolved, { recursive: true, force: true });
  await mkdir(resolved, { recursive: true });
}

export async function copyFiles(files, destination) {
  await ensureDir(destination);
  for (const file of files) await copyFile(file, path.join(destination, path.basename(file)));
}

export function rel(base, target) {
  return path.relative(base, target).split(path.sep).join('/');
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function parseArgs(argv) {
  const [command = 'help', ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (!token.startsWith('--')) throw new Error(`无法识别的参数: ${token}`);
    const key = token.slice(2);
    const next = rest[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i += 1;
    } else {
      flags[key] = true;
    }
  }
  return { command, flags };
}

export function requireFlag(flags, name) {
  const value = flags[name];
  if (!value || value === true) throw new Error(`缺少 --${name}`);
  return value;
}
