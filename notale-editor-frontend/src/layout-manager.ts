import type {Command,DeckDocument,Slide} from '@notale/editor/browser';
export function createLayoutManager(context:{mount:HTMLElement;document:()=>DeckDocument;slide:()=>Slide;commands:(commands:Command[])=>Promise<unknown>;show:(id:string)=>Promise<unknown>;error:(error:unknown)=>void}) {
  const panel=context.mount;
  const manager=document.createElement('section');manager.id='layout-manager';
  manager.innerHTML='<h3>母版</h3><p>统一多页的页脚，在画布中编辑后发布。</p><label>名称<input id="visual-layout-name" value="课程页脚"></label><label>起始版式<select id="visual-layout-preset"><option value="footer">页脚与页码</option><option value="title">标题与页脚</option><option value="blank">空白布局</option></select></label><button id="create-visual-layout">创建母版并编辑</button><p id="layout-usage" role="status"></p>';
  panel.prepend(manager);
  const advanced=document.createElement('details');advanced.id='layout-source-controls';advanced.innerHTML='<summary>高级：布局源码</summary>';
  for(const id of ['layout-name','layout-html','layout-css'])advanced.append(document.getElementById(id)!.closest('label')!);
  for(const id of ['new-layout','save-layout'])advanced.append(document.getElementById(id)!);
  panel.append(advanced);
  const library=document.createElement('section');library.id='master-library';library.append(document.getElementById('shared-layout')!.closest('label')!,document.getElementById('apply-layout-all')!,document.getElementById('edit-layout-canvas')!);panel.append(library);panel.querySelectorAll('hr').forEach(node=>node.remove());
  const banner=document.createElement('div');banner.id='master-edit-banner';banner.hidden=true;banner.innerHTML='<span id="master-edit-label"></span><button id="publish-master-return">发布并返回页面</button><button id="leave-master">返回页面</button>';
  document.getElementById('canvas-viewport')!.before(banner);
  let returnPage='',returnDocument='',busy=false;
  const run=(id:string,action:()=>Promise<unknown>)=>document.getElementById(id)!.addEventListener('click',()=>{if(busy)return;busy=true;void action().catch(context.error).finally(()=>{busy=false;render();});});
  function origin(){const deck=context.document();if(returnDocument!==deck.id||!deck.slides.some(s=>s.id===returnPage&&!s.layoutSourceId)){returnDocument=deck.id;returnPage=deck.slides.find(s=>!s.layoutSourceId)?.id??'';}return returnPage;}
  run('create-visual-layout',async()=>{
    const deck=context.document(),page=context.slide(),id=crypto.randomUUID(),newId=crypto.randomUUID();returnDocument=deck.id;returnPage=page.layoutSourceId?origin():page.id;
    const name=(document.getElementById('visual-layout-name') as HTMLInputElement).value.trim()||'母版';
    const preset=(document.getElementById('visual-layout-preset') as HTMLSelectElement).value;
    const footer='<footer style="position:absolute;left:60px;right:60px;bottom:28px;font-size:20px;color:#6638dc;display:flex;justify-content:space-between"><span data-notale-placeholder="caption" data-notale-label="页脚文字">课程要点</span><span data-notale-field="slide-number"></span></footer>';
    const title='<h2 style="position:absolute;left:60px;top:36px;font:600 40px system-ui;color:#292933" data-notale-placeholder="heading" data-notale-label="页面标题">本页标题</h2>';
    await context.commands([{type:'layout.set',layout:{id,name,sourcePath:`layouts/${id}.html`,theme:{},layer:'front',html:preset==='blank'?'':(preset==='title'?title:'')+footer,css:''}},{type:'layout.checkout',id,newId}]);await context.show(newId);
  });
  run('publish-master-return',async()=>{const target=origin();await context.commands([{type:'layout.publish',slideId:context.slide().id}]);if(target)await context.show(target);});
  run('leave-master',async()=>{const target=origin();if(target)await context.show(target);});
  function render(){
    const deck=context.document(),page=context.slide();library.hidden=!deck.layouts.length;banner.hidden=!page.layoutSourceId;
    if(!page.layoutSourceId){returnPage=page.id;returnDocument=deck.id;}
    const id=page.layoutSourceId??(document.getElementById('shared-layout') as HTMLSelectElement).value;const layout=deck.layouts.find(l=>l.id===id),count=deck.slides.filter(s=>s.layoutId===id&&id).length;
    document.getElementById('master-edit-label')!.textContent='正在编辑母版：'+(layout?.name??'')+' · 发布后更新 '+count+' 页';
    document.getElementById('layout-usage')!.textContent=page.layoutSourceId?'当前是布局草稿，放映时自动隐藏。':layout?'本页使用“'+layout.name+'”，共 '+count+' 页共享。':'本页尚未应用母版。';
    for(const id of ['create-visual-layout','publish-master-return','leave-master'])(document.getElementById(id) as HTMLButtonElement).disabled=busy;
    (document.getElementById('publish-layout-canvas') as HTMLButtonElement).disabled=!page.layoutSourceId;

    for(const action of ['apply-layout-all','edit-layout-canvas'])(document.getElementById(action) as HTMLButtonElement).disabled=!id||!!page.layoutSourceId;
  }
  async function edit(id:string,pageId=context.slide().id){if(!id)throw Error('请先选择母版');returnDocument=context.document().id;returnPage=pageId;const existing=context.document().slides.find(p=>p.layoutSourceId===id),newId=existing?.id??crypto.randomUUID();if(!existing)await context.commands([{type:'layout.checkout',id,newId}]);await context.show(newId);}
  return{render,edit};
}
