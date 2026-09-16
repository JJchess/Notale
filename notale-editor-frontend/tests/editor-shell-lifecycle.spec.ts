import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
test('disposing the viewport shell releases observers, frames and global input listeners',async({page})=>{
 await page.setContent(`<div id="canvas-viewport"><div id="canvas-stage"><div class="canvas-wrap"><iframe id="canvas"></iframe></div></div></div><select id="canvas-zoom"><option value="fit">fit</option></select><div id="canvas-pan-surface" hidden></div><details class="view-menu"></details>${['zoom-in','zoom-out','pan-canvas','focus-canvas','interact','overview'].map(id=>`<button id="${id}"></button>`).join('')}`);
 const source=readFileSync('src/editor-shell.ts','utf8').replace(/^import .*$/gm,'').replace('export function createEditorShell','function createEditorShell');
 const script=ts.transpile(source+'\n(window as any).createShell=createEditorShell;', {target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None});
 await page.evaluate(script);
 const result=await page.evaluate(()=>{
  let observed=0,disconnected=0,cancelled=0,requested=0;
  (window as any).ResizeObserver=class{observe(){observed++;}disconnect(){disconnected++;}};
  window.requestAnimationFrame=()=>++requested;window.cancelAnimationFrame=()=>cancelled++;
  const shell=(window as any).createShell();
  document.body.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',cancelable:true,bubbles:true}));const active=!document.getElementById('canvas-pan-surface')!.hidden;
  shell.wheel(20,20,10);shell.dispose();shell.dispose();
  const event=new KeyboardEvent('keydown',{code:'Space',cancelable:true,bubbles:true});document.body.dispatchEvent(event);
  shell.wheel(20,20,10);
  return {active,hidden:document.getElementById('canvas-pan-surface')!.hidden,prevented:event.defaultPrevented,observed,disconnected,cancelled,requested};
 });
 expect(result).toEqual({active:true,hidden:true,prevented:false,observed:1,disconnected:1,cancelled:1,requested:1});
});
test('context surface disposal removes its DOM and ignores delayed positioning',async({page})=>{
 await page.setContent('<main>对象菜单生命周期</main>');
 const source=readFileSync('src/object-menu.ts','utf8').replace(/^import .*$/gm,'').replace(/export /g,'');
 const script=ts.transpile(source+'\n(window as any).createMenu=createObjectMenu;', {target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None});
 await page.evaluate(()=>{const pending:((value:any)=>void)[]=[];(window as any).pendingPositions=pending;(window as any).computePosition=()=>new Promise(resolve=>pending.push(resolve));for(const name of ['flip','shift','offset','size'])(window as any)[name]=()=>({});});
 await page.evaluate(script);
 expect(await page.evaluate(async()=>{
  const old=(window as any).createMenu(()=>{});old.open(10,10,[{label:'对象'}]);const node=document.getElementById('object-context-surface')!;
  old.dispose();old.dispose();old.open(10,10,[{label:'不能重开'}]);
  for(const resolve of (window as any).pendingPositions)resolve({x:100,y:100});await Promise.resolve();
  const after={removed:!node.isConnected,position:node.style.left,count:document.querySelectorAll('#object-context-surface').length};
  const next=(window as any).createMenu(()=>{});next.open(10,10,[{label:'新菜单'}]);const opened=next.opened;next.dispose();
  return {...after,opened,remaining:document.querySelectorAll('#object-context-surface').length};
 })).toEqual({removed:true,position:'',count:0,opened:true,remaining:0});
});
test('rich text draft preserves author attributes and disposal fences capture results',async({page})=>{
 await page.setContent('<div id="selection-name"></div>');
 const model=readFileSync('src/state/rich-text-draft.ts','utf8').replace(/export /g,'');
 const ui=readFileSync('src/state/rich-editor.ts','utf8').replace(/^import .*$/gm,'').replace(/export /g,'');
 await page.evaluate(ts.transpile(model+'\n'+ui+'\n(window as any).rich={bindRichEditor,richEditorActions,richEditorState,createRichTextDraft,richTextSource};',{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}));
 const result=await page.evaluate(async()=>{
  const {bindRichEditor,richEditorActions,richEditorState,createRichTextDraft,richTextSource}=(window as any).rich;
  const object={id:'text',tag:'p',locked:false,html:'<p><a data-notale-id="link" href="https://example.com" target="_blank" data-step="2" style="position:relative;color:red">Hello</a></p>'};
  const draft=createRichTextDraft(),html=draft.prepare(richTextSource(object));
  const edited=document.createElement('div');edited.innerHTML=html;edited.querySelector('a')!.style.color='blue';
  const saved=document.createElement('div');saved.innerHTML=draft.serialize(edited.innerHTML);const link=saved.querySelector('a')!;
  let resolve!:(value:any)=>void;const control=bindRichEditor({selected:()=>object,key:()=> 'key',slideId:()=> 'page',commands:async()=>{},capture:()=>new Promise(r=>{resolve=r;})});
  richEditorActions.open();const opened=!!richEditorState.getSnapshot().editing;
  control.dispose();control.dispose();resolve({computedStyles:{text:{color:'green'}}});await Promise.resolve();
  return {target:link.target,step:link.dataset.step,position:link.style.position,color:link.style.color,opened,editing:richEditorState.getSnapshot().editing??null};
 });
 expect(result).toEqual({target:'_blank',step:'2',position:'relative',color:'blue',opened:true,editing:null});
});
test('media ingress releases global events and suppresses late upload errors',async({page})=>{
 await page.setContent('<div id="canvas-viewport"></div><div id="media-drop-overlay" hidden></div>');
 const state=readFileSync('src/state/media-drop.ts','utf8').replace(/export /g,'');
 const ingress=readFileSync('src/media-ingress.ts','utf8').replace(/^import .*$/gm,'').replace(/export /g,'');
 await page.evaluate(ts.transpile(state+'\n'+ingress+'\n(window as any).media={createMediaIngress,mediaDropState};',{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}));
 const result=await page.evaluate(async()=>{
  const {createMediaIngress,mediaDropState}=(window as any).media;let uploads=0,errors=0;let reject!:(error:Error)=>void;
  const ingress=createMediaIngress({enabled:()=>true,insert:()=>{uploads++;return new Promise((_,r)=>{reject=r;});},pasteObjects:async()=>{},error:()=>errors++});
  const data=new DataTransfer();data.items.add(new File(['x'],'image.png',{type:'image/png'}));
  document.dispatchEvent(new DragEvent('dragenter',{dataTransfer:data,cancelable:true}));const shown=!!mediaDropState.getSnapshot();
  document.getElementById('media-drop-overlay')!.dispatchEvent(new DragEvent('drop',{dataTransfer:data,cancelable:true}));
  ingress.dispose();ingress.dispose();reject(new Error('late upload'));await new Promise(r=>setTimeout(r,0));
  document.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,cancelable:true}));document.dispatchEvent(new DragEvent('dragenter',{dataTransfer:data,cancelable:true}));
  return {shown,uploads,errors,hidden:mediaDropState.getSnapshot()===undefined};
 });
 expect(result).toEqual({shown:true,uploads:1,errors:0,hidden:true});
});
