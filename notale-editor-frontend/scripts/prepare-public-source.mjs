import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const projects = ['notale-format', 'notale-editor', 'notale-editor-frontend', 'notale-ts', 'notale-viewer'];
const roots = ['README.md', 'README.zh-CN.md', 'LICENSE', '.gitignore', 'CHANGELOG.md', '.github/workflows/ci.yml', 'docs/OPEN-SOURCE-SCOPE.md'];
const frontend = JSON.parse(await readFile(path.join(repository, 'notale-editor-frontend/package.json'), 'utf8'));
const contract = frontend.dependencies['@notale/editor'];
if (!/^file:vendor\/notale-editor-[\w.-]+\.tgz$/.test(contract)) throw Error('Unexpected editor contract dependency');
const selectedArchive = contract.slice(5);
const excludedNames = new Set(['node_modules', 'dist', '.local', '.cache', '.next', 'out', 'runs', 'test-results', 'playwright-report', '.git']);
const allowedDirs = {
  'notale-format': new Set(['src']),
  'notale-editor': new Set(['docs', 'scripts', 'src', 'tests']),
  'notale-editor-frontend': new Set(['app', 'docs', 'public', 'scripts', 'src', 'templates', 'tests', 'vendor']),
  'notale-ts': new Set(['resources', 'src', 'test']),
  'notale-viewer': new Set(['app', 'public', 'src', 'tests']),
};
const excludedFiles = new Set([
  'notale-editor-frontend/templates/README.md',
  'notale-editor-frontend/docs/V1-RELEASE-PLAN.md',
  'notale-editor-frontend/docs/TODO.md',
  'notale-editor-frontend/docs/WORKLOG.md',
  'notale-editor-frontend/docs/release/EDITOR-WORKFLOW.yml',
  'notale-editor-frontend/docs/release/SOURCE-SCOPE.md',
  'notale-editor-frontend/docs/release/RELEASE-NOTES-0.1.0.md',
  'notale-editor-frontend/docs/release/ASSET-PROVENANCE.md',
  'notale-editor-frontend/docs/release/LICENSE-SCOPE.md',
  'notale-editor-frontend/scripts/release-inventory.ts',
  'notale-editor-frontend/scripts/stage-source-release.ts',
  ...['prepare.ts', 'prepare-diagrams.ts', 'prepare-fonts.py', 'extract-diagram.ts', 'refine-dom.ts', 'diagram-payload.ts'].map(name => `notale-editor-frontend/scripts/templates/${name}`),
]);
const checks = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['cloud-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['embedded-credential-url', /https?:\/\/[^\s/:@]+:[^\s/@]+@/],
  ['workspace-path', /\/(?:data1\/home|home|Users)\/[\w.-]+\//],
  ['private-project-reference', /notale[-_]v2/],
];
const files = [], excluded = [], findings = [];
const stage = await mkdtemp(path.join(tmpdir(), 'notale-public-review-'));

function skip(relative, name) {
  if (relative === 'notale-editor-frontend/public/monaco' || name === 'next-env.d.ts' || name === 'AGENTS.md' || name === 'CLAUDE.md') return 'generated output or local agent instructions';
  if (name.startsWith('.') && !['.gitignore', '.npmignore'].includes(name)) return 'hidden local or generated entry';
  if (excludedNames.has(name) || name.startsWith('.env') || /\.(?:pem|key|p12|pfx|sqlite|db|tsbuildinfo)$/.test(name)) return 'local, generated, or secret file';
  if (relative.startsWith('notale-ts/lab/')) return 'local experiment tooling';
  if (relative.startsWith('notale-editor-frontend/templates/refined/')) return 'reference-derived templates';
  if (excludedFiles.has(relative)) return 'internal historical document or tool';
  if (relative.startsWith('notale-editor-frontend/vendor/') && relative !== `notale-editor-frontend/${selectedArchive}`) return 'unselected contract archive';
  return '';
}

async function add(relative) {
  const source = path.join(repository, relative);
  const info = await lstat(source);
  if (!info.isFile() || info.isSymbolicLink()) throw Error(`Non-regular source file: ${relative}`);
  const data = await readFile(source);
  const sha256 = createHash('sha256').update(data).digest('hex');
  const target = path.join(stage, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data, { flag: 'wx' });
  await chmod(target, info.mode & 0o111 ? 0o755 : 0o644);
  const copied = await readFile(target);
  if (createHash('sha256').update(copied).digest('hex') !== sha256) throw Error(`Copy verification failed: ${relative}`);
  files.push({ path: relative, bytes: data.length, sha256 });
  if (data.includes(0) || data.length > 2_000_000 || /\.(?:png|jpe?g|webp|gif|woff2?|ttf|otf|wasm|pdf|tgz|zip|ico)$/.test(relative)) return;
  data.toString('utf8').split('\n').forEach((line, index) => {
    for (const [kind, pattern] of checks) if (pattern.test(line)) findings.push({ path: relative, line: index + 1, kind });
  });
}

async function walk(project, within = '') {
  const directory = path.join(repository, project, within);
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = `${project}/${within ? `${within}/` : ''}${entry.name}`;
    const reason = !within && entry.isDirectory() && !allowedDirs[project].has(entry.name)
      ? 'outside public project source directories' : skip(relative, entry.name);
    if (reason) { excluded.push({ path: relative, reason }); continue; }
    if (entry.isSymbolicLink()) throw Error(`Source symlink requires review: ${relative}`);
    if (entry.isDirectory()) await walk(project, within ? `${within}/${entry.name}` : entry.name);
    else if (entry.isFile()) await add(relative);
    else throw Error(`Non-regular source entry: ${relative}`);
  }
}

for (const root of roots) await add(root);
for (const project of projects) await walk(project);
if (!files.some(file => file.path === `notale-editor-frontend/${selectedArchive}`)) throw Error('Selected editor contract archive is missing');
const report = {
  status: 'private-review-only',
  source: repository,
  scope: { projects, roots, selectedArchive, historyIncluded: false },
  files,
  excluded,
  findings,
  note: 'Review third-party assets, binary archives, and findings before creating a clean public Git history. This directory is not publication clearance.',
};
const reportPath = `${stage}.json`;
await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ stage, report: reportPath, files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0), excluded: excluded.length, findings: findings.length, status: report.status }, null, 2));
