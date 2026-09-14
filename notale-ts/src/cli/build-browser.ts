import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { preparePublicationFonts, preparePublicationPlayer, preparePublicationAssets } from '../core/publication.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const diagnostics = path.join(packageRoot, 'dist/diagnostics');
await mkdir(diagnostics, { recursive: true });
await build({
  entryPoints: [path.join(packageRoot, 'src/cli/check.ts')],
  bundle: true, platform: 'node', format: 'esm', target: 'node20',
  outfile: path.join(diagnostics, 'selfcheck.mjs'), external: ['playwright', 'sharp'],
  define: { BUNDLED_SELFCHECK_PROBES: await readFile(path.join(packageRoot, 'resources/selfcheck-probe.json'), 'utf8') },
});
const harnessPackage = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
await writeFile(path.join(diagnostics, 'package.json'), JSON.stringify({
  name: 'notale-artifact-check', private: true, type: 'module',
  engines: { node: '>=20.19' },
  dependencies: { playwright: harnessPackage.dependencies.playwright, sharp: harnessPackage.dependencies.sharp },
}, null, 2) + '\n');
await cp(path.join(packageRoot, 'resources/notices/Pillow-LICENSE'), path.join(diagnostics, 'Pillow-LICENSE'));
await writeFile(path.join(diagnostics, 'SELFCHECK.md'), '# 页面复查\n\n在 pages 目录运行：\n\n```sh\nnpm install --prefix assets\nnpm exec --prefix assets -- playwright install chromium\nnode assets/selfcheck.mjs page-01.html --json\n```\n\n支持与宿主 check 相同的 --after、--shot、--shot-dir、--crop、--zoom、--wait、--text-report 和 --json。不传页面时扫描当前目录 page-*.html。依赖安装仅用于复查；页面预览不需要 Node 或这些检查依赖。检查报告中的页面问题不改变诊断成功退出码 0；未找到页面返回 2。\n');
if (process.argv.includes('--selfcheck-only')) process.exit(0);
await Promise.all([preparePublicationPlayer(), preparePublicationFonts(), preparePublicationAssets()]);
// The migrated scaffold uses the original workbench plus npm-provided runtime
// files. Only offline Python wheels need preparation; no second workbench bundle.
const packageOutput = path.join(packageRoot, "dist/browser/packages");
await mkdir(packageOutput, { recursive: true });
const lock = JSON.parse(await readFile(path.join(packageRoot, "node_modules/pyodide/pyodide-lock.json"), "utf8")) as { packages: Record<string, { file_name: string; sha256: string }> };
const requested = (process.env.NOTALE_BUNDLE_PYTHON_PACKAGES ?? "numpy").split(",").map((name) => name.trim()).filter(Boolean);
for (const name of requested) {
  if (!lock.packages[name]) throw new Error(`Unknown Pyodide package: ${name}`);
  const file = lock.packages[name].file_name;
  const destination = path.join(packageOutput, file);
  try {
    const existing = await readFile(destination);
    if (createHash('sha256').update(existing).digest('hex') === lock.packages[name].sha256) continue;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const source = process.env.NOTALE_PYODIDE_PACKAGE_URL ?? "https://cdn.jsdelivr.net/pyodide/v314.0.6/full";
  const response = await fetch(`${source.replace(/\/$/, "")}/${file}`);
  if (!response.ok) throw new Error(`Unable to download ${name}: HTTP ${response.status}`);
  const body = new Uint8Array(await response.arrayBuffer());
  const digest = createHash("sha256").update(body).digest("hex");
  if (digest !== lock.packages[name].sha256) throw new Error(`Hash mismatch for ${name}: ${digest}`);
  await writeFile(destination, body);
}
