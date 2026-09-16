import {createHash} from 'node:crypto';
import {CODE_FILES, codeResourcePath, codeRevision, type CodeLessonDescriptor} from '@notale/format';
import {parse, elements, attr, findElement, setAttr, serialize} from './html.js';
import {type DeckDocument, type Slide, type Command, invariant} from './model.js';
export const digestCode = (text: string) => createHash('sha256').update(text).digest('hex');
export function lessonFor(doc: DeckDocument, slide: Slide, target: string): CodeLessonDescriptor {
  const el = findElement(parse(slide.html), target);
  invariant(el.tagName === 'iframe' && (attr(el,'class')??'').split(/\s+/).includes('code-workbench-frame'), 'INVALID_CODE_LESSON', '请选择代码工作台');
  const entry = codeResourcePath(attr(el,'src') ?? attr(el,'data-src') ?? '', slide.sourcePath);
  const lesson = doc.codeLessons?.[entry];
  invariant(lesson, 'UNSUPPORTED_CODE_LESSON', '代码页需要重新生成 observer-v1 产物');
  return lesson;
}
export function validateCodeLessons(doc: DeckDocument) {
  if(doc.codeLessons)for(const slide of doc.slides)for(const el of elements(parse(slide.html)))if(el.tagName==='iframe'&&(attr(el,'class')??'').split(/\s+/).includes('code-workbench-frame'))invariant(doc.codeLessons[codeResourcePath(attr(el,'src')??attr(el,'data-src')??'',slide.sourcePath)],'DANGLING_OBJECT','代码课程资源仍被页面引用，操作已保留',409);

  for (const [entry, lesson] of Object.entries(doc.codeLessons ?? {})) {
    invariant(entry === lesson.entry && entry === lesson.lessonRoot + '/index.html', 'INVALID_CODE_LESSON', '课程入口不匹配');
    invariant(CODE_FILES.every(f => lesson.files[f] === lesson.lessonRoot + '/lesson/' + f), 'INVALID_CODE_LESSON', '课程文件路径不正确');
    invariant(doc.assets[entry] && doc.assets[lesson.lessonRoot + '/lesson/lesson.js'], 'MISSING_ASSET', '课程宿主缺失');
    invariant(codeRevision(lesson, doc.assets, digestCode) === lesson.revision, 'INVALID_CODE_LESSON', '课程资源修订不匹配');
  }
}
export function updateCodeLesson(doc: DeckDocument, command: Extract<Command,{type:'codeLesson.update'}>) {
  const slide = doc.slides.find(s=>s.id===command.slideId);
  invariant(slide,'SLIDE_NOT_FOUND','课程页面已删除',409);
  const root=parse(slide.html), el=findElement(root,command.target), old=lessonFor(doc,slide,command.target);
  invariant(!slide.locked.includes(command.target),'LOCKED','代码工作台已锁定');
  invariant(old.entry===command.expectedEntry && old.revision===command.expectedRevision,'SYNC_RECOVERY_REQUIRED','课程已变化，编辑草稿已保留',409);
  const next=command.lesson;
  invariant(next.lessonRoot!==old.lessonRoot && next.lessonRoot.slice(0,next.lessonRoot.lastIndexOf('/'))===old.lessonRoot.slice(0,old.lessonRoot.lastIndexOf('/')) && next.fixedRuntime===old.fixedRuntime && !doc.codeLessons?.[next.entry], 'INVALID_CODE_LESSON','新课程资源目录不正确');
  const allowed=new Set(CODE_FILES.map(f=>next.files[f]));
  for(const [path,asset] of Object.entries(command.assets)) {
    invariant(path.startsWith(next.lessonRoot+'/') && !doc.assets[path], 'INVALID_CODE_LESSON','课程资源不能覆盖其他内容');
    const previous=old.lessonRoot+path.slice(next.lessonRoot.length);
    if(!allowed.has(path)&&path!==next.lessonRoot+'/lesson/preview.json')invariant(doc.assets[previous]?.hash===asset.hash,'INVALID_CODE_LESSON','只能编辑四份课程源码');
    doc.assets[path]=asset;
  }
  for(const path of Object.keys(doc.assets).filter(p=>p.startsWith(old.lessonRoot+'/')&&!p.endsWith('/preview.json'))) {
    const dest=next.lessonRoot+path.slice(old.lessonRoot.length);
    invariant(doc.assets[dest], 'MISSING_ASSET','新课程宿主资源不完整');
  }
  doc.codeLessons={...doc.codeLessons,[next.entry]:next};
  // Keep query parameters (notably the authored theme) and fragment intact.
  for(const name of ['src','data-src']) {
    const value=attr(el,name); if(value===undefined)continue;
    const url=new URL(value,new URL(slide.sourcePath,'https://notale.invalid/'));
    const base=new URL(slide.sourcePath,'https://notale.invalid/').pathname.split('/').slice(1,-1);
    const parts=next.entry.split('/');while(base.length&&base[0]===parts[0]){base.shift();parts.shift();}
    setAttr(el,name,'../'.repeat(base.length)+parts.join('/')+url.search+url.hash);
  }
  slide.html=serialize(root);
}
