/** Author-owned files; execution state is never part of this contract. */
export const CODE_RUNTIME_VERSION = 'observer-v1' as const;
export const CODE_FILES = ['starter.py', 'observe.py', 'tests.py', 'view/render.js'] as const;
export type CodeFile = typeof CODE_FILES[number];
export type CodeSources = Record<CodeFile, string>;
export interface CodeLessonDescriptor {
  runtimeVersion: typeof CODE_RUNTIME_VERSION;
  entry: string;
  lessonRoot: string;
  fixedRuntime: string;
  files: Record<CodeFile, string>;
  revision: string;
}
type Assets = Record<string, {hash: string}>;
export function codeResourcePath(value: string, from: string): string {
  const url = new URL(value, new URL(from, 'https://notale.invalid/'));
  if (url.origin !== 'https://notale.invalid') throw Error('代码课程只能引用工程内资源');
  return decodeURIComponent(url.pathname.slice(1));
}
export function codeRevision(descriptor: Omit<CodeLessonDescriptor, 'revision'>, assets: Assets, digest: (text: string) => string): string {
  const fixed = Object.keys(assets).filter(p => p.startsWith(descriptor.fixedRuntime + '/')).sort();
  if (!fixed.length) throw Error('代码课程固定运行时缺失');
  const hashes = CODE_FILES.map(file => {
    const asset = assets[descriptor.files[file]];
    if (!asset) throw Error('代码课程文件缺失：' + file);
    return [file, asset.hash];
  });
  return digest(JSON.stringify([descriptor.runtimeVersion, hashes, fixed.map(p => [p.slice(descriptor.fixedRuntime.length), assets[p].hash])]));
}
export function discoverCodeLessons(files: Record<string, Uint8Array>, assets: Assets, digest: (text: string) => string): Record<string, CodeLessonDescriptor> {
  const result: Record<string, CodeLessonDescriptor> = {};
  for (const marker of Object.keys(files).filter(p => p.endsWith('/.notale-code-lesson.json'))) {
    const meta = JSON.parse(new TextDecoder().decode(files[marker]));
    if (meta.runtimeVersion !== CODE_RUNTIME_VERSION) throw Error('旧版或未知代码页不再支持，请重新生成新版页面');
    const lessonRoot = marker.slice(0, -'/.notale-code-lesson.json'.length);
    const entry = lessonRoot + '/index.html';
    if (!files[entry] || !files[lessonRoot + '/lesson/lesson.js'] || !files[lessonRoot + '/lesson/view/index.html']) throw Error('代码课程宿主文件缺失');
    if (JSON.stringify(meta.editable) !== JSON.stringify(CODE_FILES.map(f => 'lesson/' + f))) throw Error('代码课程作者文件清单不正确');
    const descriptor: Omit<CodeLessonDescriptor, 'revision'> = {
      runtimeVersion: CODE_RUNTIME_VERSION, entry, lessonRoot,
      fixedRuntime: codeResourcePath(meta.fixedRuntime, marker),
      files: Object.fromEntries(CODE_FILES.map(f => [f, lessonRoot + '/lesson/' + f])) as Record<CodeFile, string>,
    };
    result[entry] = {...descriptor, revision: codeRevision(descriptor, assets, digest)};
  }
  return result;
}
