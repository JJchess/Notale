import type { Asset, Command, DeckDocument } from '@notale/editor/browser';
export function createAssetLibrary(context: {
  document: () => DeckDocument;
  slide: () => { id:string; sourcePath:string };
  selection: () => { id:string; tag:string; locked:boolean }[];
  insert: (kind:string, src:string) => string;
  commands: (commands:Command[]) => Promise<unknown>;
  error: (error:unknown) => void;
}) {
  const section=document.querySelector<HTMLElement>('[data-library="resources"]')!;
  const panel=document.createElement('section'); panel.id='asset-library';
  panel.innerHTML=`<h3>讲义中的素材 <span id="asset-count"></span></h3><label>搜索素材<input id="asset-search" type="search" placeholder="文件名或目录"></label><label class="sr-only">素材类型<select id="asset-kind"><option value="all">全部媒体</option><option value="image">图片</option><option value="video">视频</option><option value="audio">音频</option></select></label><div id="asset-results" class="asset-results"></div><p id="asset-empty" class="hint" hidden>没有匹配的素材。可以上传本地文件。</p><button id="asset-more" hidden>显示更多</button><div id="asset-actions" hidden><p id="asset-selected-name"></p><button id="asset-insert">插入到当前页</button><button id="asset-replace" disabled>替换选中媒体</button><p id="asset-hint" class="hint"></p></div>`;
  section.append(panel);
  const el=<T extends HTMLElement=HTMLElement>(id:string)=>panel.querySelector<T>('#'+id)!;
  let base='', documentId='', selectedPath='', limit=36;
  let entries:[string,Asset][]=[];
  let busy=false;
  const kind=(asset:Asset)=>asset.mime.split('/')[0];
  function actions() {
    const entry=entries.find(([path])=>path===selectedPath);
    el('asset-actions').hidden=!entry;
    if(!entry) return;
    el('asset-selected-name').textContent=selectedPath;
    const selected=context.selection();
    const canReplace=selected.length===1 && !selected[0].locked && selected[0].tag===(kind(entry[1])==='image'?'img':kind(entry[1]));
    el<HTMLButtonElement>('asset-insert').disabled=busy;
    el<HTMLButtonElement>('asset-replace').disabled=busy||!canReplace;
    el('asset-hint').textContent=canReplace?'替换会保留对象的位置、尺寸和媒体设置。':'选择同类型的未锁定媒体对象后可以替换。';
  }
  function render() {
    if(section.hidden || !section.closest<HTMLDetailsElement>('details')?.open || !base) return;
    const query=el<HTMLInputElement>('asset-search').value.trim().toLocaleLowerCase();
    const type=el<HTMLSelectElement>('asset-kind').value;
    const filtered=entries.filter(([path,asset])=>path.toLocaleLowerCase().includes(query)&&(type==='all'||kind(asset)===type));
    el('asset-count').textContent=String(entries.length);
    el('asset-empty').hidden=filtered.length>0;
    el('asset-more').hidden=filtered.length<=limit;
    el('asset-results').replaceChildren(...filtered.slice(0,limit).map(([path,asset])=>{
      const button=document.createElement('button'); button.className='asset-card'; button.type='button'; button.dataset.assetPath=path;
      button.title=path; button.setAttribute('aria-pressed',String(path===selectedPath));
      if(kind(asset)==='image') {
        const img=document.createElement('img'); img.src=new URL(path.split('/').map(encodeURIComponent).join('/'),base).href;
        img.alt=''; img.loading='lazy'; img.decoding='async'; img.referrerPolicy='no-referrer';
        img.addEventListener('error',()=>{img.hidden=true; button.classList.add('asset-unavailable');});
        button.append(img);
      } else {
        const icon=document.createElement('span'); icon.className='asset-symbol'; icon.textContent=kind(asset)==='video'?'▷':'♫';button.append(icon);
      }
      const name=document.createElement('span');name.textContent=path.split('/').at(-1)!;button.append(name);
      button.addEventListener('click',()=>{selectedPath=path;render();});
      return button;
    }));
    actions();
  }
  async function use(replace:boolean) {
    if(busy || documentId!==context.document().id) return;
    const entry=entries.find(([path])=>path===selectedPath);if(!entry)return;
    const selected=context.selection(), page=context.slide();
    const mediaKind=kind(entry[1]);
    if(replace&&(selected.length!==1||selected[0].locked||selected[0].tag!==(mediaKind==='image'?'img':mediaKind))) return;
    const src='../'.repeat(page.sourcePath.split('/').length-1)+selectedPath.split('/').map(encodeURIComponent).join('/');
    busy=true;actions();
    try {
      await context.commands([replace ? {type:'media.update',slideId:page.id,target:selected[0].id,patch:{src}} : {type:'element.insert',slideId:page.id,html:context.insert(mediaKind,src)}]);
    } catch(error) {context.error(error);} finally {busy=false;actions();}
  }
  el('asset-insert').addEventListener('click',()=>void use(false));
  el('asset-replace').addEventListener('click',()=>void use(true));
  el('asset-search').addEventListener('input',()=>{limit=36;render();});
  el('asset-kind').addEventListener('change',()=>{limit=36;render();});
  el('asset-more').addEventListener('click',()=>{limit+=36;render();});
  section.closest('details')!.addEventListener('toggle',render);
  return {
    update(previewUrl:string, sourcePath:string) {
      const doc=context.document();
      if(doc.id!==documentId) {selectedPath='';limit=36;el<HTMLInputElement>('asset-search').value='';}
      documentId=doc.id;
      base=new URL('../'.repeat(sourcePath.split('/').length-1)||'.',previewUrl).href;
      entries=Object.entries(doc.assets).filter(([,asset])=>['image','video','audio'].includes(kind(asset))).sort(([a],[b])=>a.localeCompare(b));
      if(!entries.some(([path])=>path===selectedPath))selectedPath='';
      render();
    },
    selection:actions,
  };
}
