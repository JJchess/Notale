import type {Command,DeckDocument,Slide} from '@notale/editor/browser';
type ObjectInfo={id:string;parent?:string;tag:string;locked:boolean;attributes:Record<string,string>};
export function createLinkInspector(context:{document:()=>DeckDocument;slide:()=>Slide;objects:()=>ObjectInfo[];selected:()=>string[];commands:(commands:Command[])=>Promise<unknown>;error:(error:unknown)=>void}) {
  const panel=document.createElement('fieldset');panel.id='link-editor';
  panel.innerHTML='<legend>链接与页面跳转</legend><label>目标类型<select id="link-kind"><option value="page">讲义中的页面</option><option value="url">外部链接</option></select></label><label id="link-page-label">跳转到<select id="link-page"></select></label><label id="link-url-label" hidden>链接地址<input id="link-url" type="url" placeholder="https://…"></label><label>新按钮文字<input id="link-label" value="继续探索"></label><button id="insert-link">插入跳转按钮</button><button id="update-link" disabled>更新所选链接地址</button><button id="remove-link" disabled>移除所选链接</button><p id="link-status" class="hint" role="status">选中已有链接可以修改地址。</p>';
  const trigger=document.createElement('button');trigger.id='open-link-insert';trigger.className='preset-card';trigger.textContent='链接与页面跳转';trigger.type='button';
  document.querySelector('[data-library="interactive"]')!.append(trigger);
  const dialog=document.createElement('dialog');dialog.id='link-insert-dialog';dialog.setAttribute('aria-labelledby','link-insert-title');dialog.innerHTML='<header><h2 id="link-insert-title">插入跳转按钮</h2><button type="button" aria-label="关闭">×</button></header>';
  document.body.append(dialog);document.getElementById('selection-name')!.after(panel);
  let creating=false;
  const finish=()=>{creating=false;document.getElementById('selection-name')!.after(panel);key='';render();};
  dialog.addEventListener('close',finish);dialog.querySelector('header button')!.addEventListener('click',()=>dialog.close());
  trigger.onclick=()=>{creating=true;key='';dialog.append(panel);render();dialog.showModal();};
  const el=<T extends HTMLElement=HTMLElement>(id:string)=>panel.querySelector<T>('#'+id)!;
  const value=(id:string)=>el<HTMLInputElement>(id).value;
  let key='',busy=false;
  function anchor() {
    if(creating||context.selected().length!==1)return;
    let node=context.objects().find(o=>o.id===context.selected()[0]);
    while(node){if(node.tag==='a')return node;node=context.objects().find(o=>o.id===node!.parent);}
  }
  function changeKind(){el('link-page-label').hidden=value('link-kind')!=='page';el('link-url-label').hidden=value('link-kind')!=='url';}
  function render() {
    const doc=context.document(), selected=anchor();
    panel.hidden=!creating&&!selected;el('insert-link').hidden=!creating;el('link-label').closest<HTMLElement>('label')!.hidden=!creating;
    for(const id of ['update-link','remove-link','link-status'])el(id).hidden=creating;
    const next=JSON.stringify([creating,doc.id,doc.slides.map(s=>[s.id,s.name,s.sourcePath]),context.slide().id,context.selected(),selected]);
    const locked=selected?.locked||context.selected().some(id=>context.objects().find(o=>o.id===id)?.locked);
    for(const id of ['update-link','remove-link'])el<HTMLButtonElement>(id).disabled=busy||!selected||!!locked;
    el<HTMLButtonElement>('insert-link').disabled=busy;
    if(key===next)return;key=next;
    const old=value('link-page');
    el('link-page').replaceChildren(...doc.slides.map((s,i)=>new Option(`${i+1} · ${s.name}`,s.id)));
    el<HTMLSelectElement>('link-page').value=doc.slides.some(s=>s.id===old)?old:(doc.slides.find(s=>s.id!==context.slide().id)?.id??context.slide().id);
    const href=selected?.attributes.href;
    if(href){
      let destination:URL|undefined;try{destination=new URL(href,'https://notale.invalid/'+context.slide().sourcePath);}catch{}
      let path='';try{path=decodeURIComponent(destination?.pathname.slice(1)??'');}catch{}
      const page=destination?.origin==='https://notale.invalid'?doc.slides.find(s=>s.sourcePath===path):undefined;
      el<HTMLSelectElement>('link-kind').value=page?'page':'url';
      if(page)el<HTMLSelectElement>('link-page').value=page.id;else el<HTMLInputElement>('link-url').value=href;
    }
    el('link-status').textContent=locked?'选中的链接已锁定。':selected?'修改地址会保留链接内部的文字与图片。':'选中已有链接可以修改地址。';
    changeKind();
  }
  function attributes() {
    if(value('link-kind')==='page') {
      const target=context.document().slides.find(s=>s.id===value('link-page'));if(!target)throw new Error('请选择目标页面');
      return {href:'../'.repeat(context.slide().sourcePath.split('/').length-1)+target.sourcePath.split('/').map(encodeURIComponent).join('/'),target:null,rel:null};
    }
    const url=new URL(value('link-url'));
    if(!['https:','http:','mailto:','tel:'].includes(url.protocol))throw new Error('请输入网页、邮件或电话链接');
    return {href:url.href,target:'_blank',rel:'noopener noreferrer'};
  }
  const escape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  async function run(action:()=>Promise<unknown>) {if(busy)return;busy=true;render();try{await action();}catch(error){context.error(error);}finally{busy=false;render();}}
  el('link-kind').addEventListener('change',changeKind);
  el('insert-link').addEventListener('click',()=>void run(async()=>{
    const attrs=Object.entries(attributes()).filter(([,v])=>v!==null).map(([k,v])=>`${k}="${escape(v!)}"`).join(' ');
    if(!value('link-label').trim())throw new Error('请输入按钮文字');
    await context.commands([{type:'element.insert',slideId:context.slide().id,html:`<a ${attrs} style="position:absolute;left:120px;top:160px;z-index:1000;display:inline-block;padding:16px 24px;background:#6638dc;color:white;border-radius:8px;text-decoration:none;font:600 26px system-ui">${escape(value('link-label'))}</a>`}]);
    dialog.close();
  }));
  el('update-link').addEventListener('click',()=>void run(async()=>{const selected=anchor();if(!selected||selected.locked)return;await context.commands([{type:'element.patch',slideId:context.slide().id,target:selected.id,patch:{attributes:attributes()}}]);}));
  el('remove-link').addEventListener('click',()=>void run(async()=>{const selected=anchor();if(!selected||selected.locked)return;await context.commands([{type:'element.patch',slideId:context.slide().id,target:selected.id,patch:{attributes:{href:null,target:null,rel:null}}}]);}));
  return {render};
}
