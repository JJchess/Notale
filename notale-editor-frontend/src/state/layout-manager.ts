import type {Command,DeckDocument,Slide} from '@notale/editor/browser';
export interface LayoutDraft {name:string;html:string;css:string;}
export interface LayoutManagerModel {scope:string;selected:string;layouts:{id:string;name:string;count:number}[];draft:LayoutDraft;editing:boolean;usage:string;label:string;busy:boolean;error:string;select?:(id:string)=>void;change?:(draft:LayoutDraft)=>void;run?:(action:string,name?:string,preset?:string)=>Promise<void>;}
const footer='<footer style="position:absolute;left:60px;right:60px;bottom:28px;font-size:20px;color:#6638dc;display:flex;justify-content:space-between"><span data-notale-placeholder="caption" data-notale-label="页脚文字">课程要点</span><span data-notale-field="slide-number"></span></footer>';
const initial:LayoutManagerModel={scope:'',selected:'',layouts:[],draft:{name:'页脚布局',html:footer,css:''},editing:false,usage:'',label:'',busy:false,error:''};
let model=initial,owner:symbol|undefined;const listeners=new Set<()=>void>();
function publish(next:LayoutManagerModel){model=next;listeners.forEach(fn=>fn());}
export const layoutManagerState={getSnapshot:()=>model,getServerSnapshot:()=>initial,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};}};
export function createLayoutManager(context:{document:()=>DeckDocument;slide:()=>Slide;commands:(commands:Command[])=>Promise<unknown>;show:(id:string)=>Promise<unknown>}){
 const token=Symbol();owner=token;let scope='',selected='',baseline='',draft=initial.draft,returnPage='',returnDocument='',busy=false,error='';
 const active=()=>owner===token;
 function origin(){const deck=context.document();if(returnDocument!==deck.id||!deck.slides.some(s=>s.id===returnPage&&!s.layoutSourceId)){returnDocument=deck.id;returnPage=deck.slides.find(s=>!s.layoutSourceId)?.id??'';}return returnPage;}
 function fill(force=false){const layout=context.document().layouts.find(l=>l.id===selected);const next={name:layout?.name??'页脚布局',html:layout?.html??footer,css:layout?.css??''};if(force||JSON.stringify(draft)===baseline){draft=next;baseline=JSON.stringify(next);}}
 function render(){if(!active())return;const deck=context.document(),page=context.slide(),nextScope=JSON.stringify([deck.id,page.id]);if(scope!==nextScope){scope=nextScope;selected=page.layoutSourceId??page.layoutId??'';fill(true);error='';}else fill();if(!page.layoutSourceId){returnPage=page.id;returnDocument=deck.id;}
 const layout=deck.layouts.find(l=>l.id===selected),count=deck.slides.filter(s=>s.layoutId===selected&&!s.layoutSourceId).length;
 const capturedScope=scope;
 publish({scope,selected,draft:{...draft},layouts:deck.layouts.map(l=>({id:l.id,name:l.name,count:deck.slides.filter(s=>s.layoutId===l.id&&!s.layoutSourceId).length})),editing:!!page.layoutSourceId,busy,error,usage:page.layoutSourceId?'当前是布局草稿，放映时自动隐藏。':layout?'已选择“'+layout.name+'”，共 '+count+' 页共享。':'本页尚未应用母版。',label:'正在编辑母版：'+(layout?.name??'')+' · 发布后更新 '+count+' 页',select:id=>{if(!active()||scope!==capturedScope||busy)return;selected=id;fill(true);render();},change:next=>{if(!active()||scope!==capturedScope||busy)return;draft={...next};render();},run:async(action,name,preset)=>{if(!active()||scope!==capturedScope||busy)return;busy=true;error='';render();try{await execute(action,name,preset);}catch(cause){if(active()&&scope===capturedScope)error=cause instanceof Error?cause.message:String(cause);}finally{busy=false;render();}}});
 }
 async function show(id:string,documentId:string){if(active()&&context.document().id===documentId)await context.show(id);}
 async function edit(id:string,pageId=context.slide().id){if(!active())return;if(!id)throw Error('请先选择母版');const deck=context.document();returnDocument=deck.id;returnPage=pageId;const existing=deck.slides.find(p=>p.layoutSourceId===id),newId=existing?.id??crypto.randomUUID();if(!existing)await context.commands([{type:'layout.checkout',id,newId}]);await show(newId,deck.id);}
 async function execute(action:string,name='母版',preset='footer'){
 const deck=context.document(),page=context.slide(),layout=deck.layouts.find(l=>l.id===selected);
 if(action==='create'){const id=crypto.randomUUID(),newId=crypto.randomUUID();returnDocument=deck.id;returnPage=page.layoutSourceId?origin():page.id;const title='<h2 style="position:absolute;left:60px;top:36px;font:600 40px system-ui;color:#292933" data-notale-placeholder="heading" data-notale-label="页面标题">本页标题</h2>';await context.commands([{type:'layout.set',layout:{id,name:name.trim()||'母版',sourcePath:`layouts/${id}.html`,theme:{},layer:'front',html:preset==='blank'?'':(preset==='title'?title:'')+footer,css:''}},{type:'layout.checkout',id,newId}]);await show(newId,deck.id);}
 else if(action==='edit')await edit(selected);
 else if(action==='apply'){if(!layout)throw Error('请先选择母版');await context.commands(deck.slides.filter(s=>!s.layoutSourceId).map(s=>({type:'slide.update',slideId:s.id,patch:{layoutId:selected}})));}
 else if(action==='new'||action==='save'){if(action==='save'&&!layout)throw Error('请先选择一个共享布局');if(action==='save'&&layout&&JSON.stringify({name:layout.name,html:layout.html,css:layout.css})!==baseline)throw Error('母版已更新，请重新选择母版后核对修改');const source={...draft},id=action==='new'?crypto.randomUUID():selected;await context.commands([{type:'layout.set',layout:{sourcePath:`layouts/${id}.html`,theme:{},layer:'front',...(action==='save'?layout:{}),id,...source}}]);if(active()&&context.document().id===deck.id&&context.slide().id===page.id){selected=id;draft=source;baseline=JSON.stringify(source);}}
 else if(action==='publish'||action==='publish-return'){if(!page.layoutSourceId)throw Error('当前页面不是母版草稿');const target=origin();await context.commands([{type:'layout.publish',slideId:page.id}]);if(action==='publish-return'&&target)await show(target,deck.id);}
 else if(action==='leave'){const target=origin();if(target)await show(target,deck.id);}
 }
 return {render,edit,dispose(){if(active()){owner=undefined;publish(initial);}}};
}
