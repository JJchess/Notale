import { arrangePlan, applyAuthorChanges, mergeAuthorHtml, type AuthorChangeSet, type Command, type Snapshot, type Slide } from '@notale/editor/browser';

const local = new Set<Command['type']>(['elements.arrange','element.patch','element.transform','element.lock','group.set','group.remove','slide.update','deck.update','animation.set','animation.remove','animation.reorder','native-chart.edit','native-chart.set','native-chart.remove','svg.patch','svg.structure']);
export const canProject = (commands: Command[]) => commands.every(c => local.has(c.type));
const style = (node: HTMLElement | SVGElement, patch: Record<string, string>) => {
  for (const [key, value] of Object.entries(patch)) {
    if (!value) node.style.removeProperty(key);
    else node.style.setProperty(key, value.replace(/\s*!important\s*$/i, ''), /!important\s*$/i.test(value) ? 'important' : '');
  }
};
/** Detached author DOMs are built once per affected page, never from live runtime DOM. */
export function projectCommands(source: Snapshot, commands: Command[]): Snapshot {
  const document = { ...source.document, slides: [...source.document.slides] }, pages = new Map<string, Slide>(), html = new Map<string, Document>();
  function page(id: string) {
    if (!pages.has(id)) { const original = document.slides.find(s => s.id === id); if (!original) return;
      const copy = structuredClone(original); pages.set(id, copy); document.slides[document.slides.indexOf(original)] = copy;
    }
    return pages.get(id)!;
  }
  function dom(s: Slide) { if (!html.has(s.id)) html.set(s.id, new DOMParser().parseFromString(s.html, 'text/html')); return html.get(s.id)!; }
  const expanded=commands.flatMap(c=>c.type==='elements.arrange'?arrangePlan(source.document,source.document.slides.find(s=>s.id===c.slideId)!,c):[c]);
  for (const c of expanded) {
    if (c.type === 'deck.update') { const {type,...patch}=c;Object.assign(document, patch); continue; }
    if (!('slideId' in c)) continue;
    const s = page(c.slideId); if (!s) continue;
    const get = (id: string) => dom(s).querySelector<HTMLElement>('[' + 'data-notale-id="' + CSS.escape(id) + '"]');
    if (c.type === 'element.patch') {
      const node = get(c.target); if (!node) continue;
      if (c.patch.style) style(node, c.patch.style);
      if (c.patch.attributes) for (const [key,value] of Object.entries(c.patch.attributes)) { if (key.startsWith('on') || ['srcdoc','data-notale-id','id','style'].includes(key)) continue; if (value === null) node.removeAttribute(key); else node.setAttribute(key,value); }
      if (c.patch.text !== undefined) node.textContent = c.patch.text;
      if (c.patch.richText !== undefined) node.innerHTML = c.patch.richText;
    } else if (c.type === 'element.transform') {
      const node = get(c.target); if (!node) continue; const t = c.transform; s.transforms[c.target] = t;
      style(node, { ...(t.matrix ? {transform:'matrix(' + t.matrix.join(',') + ')'} : {}), translate:t.x + 'px ' + t.y + 'px', rotate:t.rotate + 'deg', scale:t.scaleX + ' ' + t.scaleY,
        ...(t.width === null ? {width:'auto'} : t.width ? {width:t.width + 'px'} : {}), ...(t.height === null ? {height:'auto'} : t.height ? {height:t.height + 'px'} : {}) });
    } else if (c.type === 'element.lock') { s.locked = s.locked.filter(id=>id!==c.target); if (c.locked) s.locked.push(c.target); }
    else if (c.type === 'slide.update') Object.assign(s,c.patch);
    else if (c.type === 'group.set') { s.groups=s.groups.filter(g=>g.id!==c.id).map(g=>({...g,members:g.members.filter(id=>!c.members.includes(id))})).filter(g=>g.members.length>=2); s.groups.push({id:c.id,name:c.name,members:c.members}); }
    else if (c.type === 'group.remove') s.groups=s.groups.filter(g=>g.id!==c.id);
    else if (c.type === 'animation.set') { s.animations=s.animations.filter(a=>a.id!==c.animation.id); s.animations.push(c.animation); }
    else if (c.type === 'animation.remove') s.animations=s.animations.filter(a=>a.id!==c.id);
    else if (c.type === 'animation.reorder') s.animations=[...c.ids.flatMap(id=>s.animations.find(a=>a.id===id)??[]),...s.animations.filter(a=>!c.ids.includes(a.id))];
    else if (c.type === 'native-chart.edit') s.nativeCharts[c.target]={...s.nativeCharts[c.target],adapter:'echarts',option:s.nativeCharts[c.target]?.option??{},authoring:c.model};
    else if (c.type === 'native-chart.set') s.nativeCharts[c.target]={...s.nativeCharts[c.target],adapter:'echarts',option:c.option};
    else if (c.type === 'native-chart.remove') delete s.nativeCharts[c.target];
    else if (c.type === 'svg.patch' || c.type === 'svg.structure') for (const mutation of c.mutations) {
      const node = 'target' in mutation ? get(mutation.target) : undefined;
      if (mutation.op==='set' || mutation.op==='move') {
        if(node && mutation.attributes) for(const [key,value] of Object.entries(mutation.attributes)) { if(key.startsWith('on'))continue;if(value===null)node.removeAttribute(key);else node.setAttribute(key,value); }
        if(node && mutation.op==='set' && mutation.text!==undefined)node.textContent=mutation.text;
        if(node && mutation.op==='move') { const parent=get(mutation.parent);parent?.insertBefore(node,parent.children[mutation.index]??null); }
      } else if(mutation.op==='remove')node?.remove();
      else if(mutation.op==='replace') { if(node)node.outerHTML=mutation.html; }
      else if(mutation.op==='insert'){const parent=get(mutation.parent);if(parent){const range=dom(s).createRange();range.selectNodeContents(parent);parent.insertBefore(range.createContextualFragment(mutation.html),parent.children[mutation.index]??null);}}
    }
  }
  for (const [id, node] of html) pages.get(id)!.html=(node.doctype?'<!DOCTYPE html>':'')+node.documentElement.outerHTML;
  return { ...source, document };
}

/** Prepared/undo changes are rebased by author identity instead of HTML byte offsets. */
export function projectPrepared(source: Snapshot, change: AuthorChangeSet, bases: Record<string, string> = {}): Snapshot {
  let next = source;
  for (const patch of change.changes) {
    if (patch.splice) {
      const id = change.slideIds?.[Number(patch.path[1])]??Object.keys(bases).find(id => source.document.slides.findIndex(s=>s.id===id) === patch.path[1]);
      if (!id) { next=applyAuthorChanges({...next,version:change.fromVersion},{...change,changes:[patch]});continue; }
      const base=bases[id], splice=patch.splice, intended=base.slice(0,splice.start)+splice.inserted+base.slice(splice.start+splice.removed.length);
      next={...next,document:{...next.document,slides:next.document.slides.map(s=>s.id===id?{...s,html:mergeAuthorHtml(base,intended,s.html)}:s)}};
    } else {
      // Metadata paths are authored values; overlay only the touched field.
      const path=[...patch.path];if(path[0]==='slides'&&typeof path[1]==='number'&&change.slideIds){const index=next.document.slides.findIndex(s=>s.id===change.slideIds![Number(path[1])]);if(index<0)continue;path[1]=index;}
      const current=path.reduce<any>((value,key)=>value?.[key],next.document);
      next=applyAuthorChanges({...next,version:change.fromVersion},{...change,changes:[{...patch,path,before:current}]});
    }
  }
  return {...next,version:source.version};
}
