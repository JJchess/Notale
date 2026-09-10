import { commitSchema, type Command, type Slide, type InteractiveComponent } from '@notale/editor/browser';
type ObjectInfo={id:string;parent?:string;tag:string;text:string;locked:boolean;attributes:Record<string,string>};
export function createRevealPreset(context:{
  slide:()=>Slide; objects:()=>ObjectInfo[]; selected:()=>string[];
  commands:(commands:Command[])=>Promise<unknown>; whenReady:()=>Promise<void>;
  choose:(id:string)=>void; error:(error:unknown)=>void;
}) {
  const panel=document.querySelector<HTMLElement>('[data-library="interactive"]')!;
  const box=document.createElement('div');box.id='reveal-preset';
  box.innerHTML=`<button id="insert-reveal" class="preset-card"><strong>点击展开解释</strong><span>先提问，再揭示答案；支持再次收起。</span></button><fieldset id="reveal-editor" hidden><legend>展开解释</legend><label>组件名称<input id="reveal-name"></label><label>展开按钮文字<input id="reveal-closed-label"></label><label>收起按钮文字<input id="reveal-open-label"></label><label>解释内容<textarea id="reveal-answer" rows="4"></textarea></label><label>打开页面时<select id="reveal-initial"><option value="closed">收起解释</option><option value="open">显示解释</option></select></label><button id="save-reveal">保存互动内容</button><p class="hint">点“体验本页互动”检查展开和收起。组件也可以复制到其他页面。</p></fieldset>`;
  panel.prepend(box);
  const el=<T extends HTMLElement=HTMLElement>(id:string)=>box.querySelector<T>('#'+id)!;
  const val=(id:string)=>el<HTMLInputElement>(id).value;
  let key='';let busy=false;
  function current() {
    const objects=context.objects(), selected=context.selected();
    const inside=(id:string,root:string)=>{let o=objects.find(o=>o.id===id);while(o){if(o.id===root)return true;o=objects.find(p=>p.id===o!.parent);}return false;};
    return (context.slide().components ?? []).find(c=>!c.instance&&objects.find(o=>o.id===c.root)?.attributes['data-notale-preset']==='reveal'&&selected.some(id=>inside(id,c.root)));
  }
  function parts(component:InteractiveComponent) {
    const candidates=context.objects().filter(o=>o.parent===component.root);
    return {button:candidates.find(o=>o.attributes['data-notale-role']==='toggle')!,answer:candidates.find(o=>o.attributes['data-notale-role']==='answer')!};
  }
  function render() {
    const c=current(), editor=el<HTMLFieldSetElement>('reveal-editor');
    editor.hidden=!c;
    if(!c){key='';return;}
    const {button,answer}=parts(c);if(!button||!answer){editor.hidden=true;return;}
    editor.disabled=busy||context.objects().some(o=>[c.root,button.id,answer.id].includes(o.id)&&o.locked);
    const next=JSON.stringify([context.slide().id,c,answer.text]);if(next===key)return;key=next;
    el<HTMLInputElement>('reveal-name').value=c.name;
    el<HTMLInputElement>('reveal-closed-label').value=c.states.find(s=>s.id==='closed')?.patches[button.id]?.text??button.text;
    el<HTMLInputElement>('reveal-open-label').value=c.states.find(s=>s.id==='open')?.patches[button.id]?.text??button.text;
    el<HTMLInputElement>('reveal-answer').value=answer.text;
    el<HTMLSelectElement>('reveal-initial').value=c.initial;
  }
  async function run(action:()=>Promise<unknown>) {
    if(busy)return;busy=true;el<HTMLButtonElement>('insert-reveal').disabled=true;render();
    try{await action();}catch(error){context.error(error);}finally{busy=false;el<HTMLButtonElement>('insert-reveal').disabled=false;render();}
  }
  el('insert-reveal').addEventListener('click',()=>void run(async()=>{
    const sourceId=crypto.randomUUID(), componentId=crypto.randomUUID(),destination=context.slide().id;
    const old=new Set((context.slide().components ?? []).map(c=>c.id));
    const html=`<!doctype html><html><body><main id="stage"><section data-notale-id="reveal-root" data-notale-preset="reveal" style="position:absolute;z-index:1000;isolation:isolate;left:120px;top:160px;width:640px;height:340px;box-sizing:border-box;padding:28px;border:1px solid #d9d1ed;border-radius:14px;background:#fff;color:#292a32;font-family:system-ui"><button data-notale-id="reveal-toggle" data-notale-role="toggle" type="button" style="font:600 26px system-ui;padding:14px 22px;border:0;border-radius:8px;background:#6638dc;color:white;cursor:pointer">查看解释</button><p data-notale-id="reveal-answer" data-notale-role="answer" style="font-size:28px;line-height:1.6;margin:24px 0 0">在这里写下解释，讲授时点击按钮揭示。</p></section></main></body></html>`;
    const component={id:componentId,root:'reveal-root',name:'点击展开解释',initial:'closed',duration:200,easing:'ease',states:[
      {id:'closed',name:'收起',patches:{'reveal-toggle':{text:'查看解释'},'reveal-answer':{visible:false,style:{opacity:'0'}}}},
      {id:'open',name:'展开',patches:{'reveal-toggle':{text:'收起解释'},'reveal-answer':{visible:true,style:{opacity:'1'}}}},
    ],events:[{id:'open-event',target:'reveal-toggle',event:'click',from:'closed',to:'open'},{id:'close-event',target:'reveal-toggle',event:'click',from:'open',to:'closed'}],steps:[]};
    // A temporary source page exists only inside this atomic command transaction.
    // Existing transfer remaps object/component IDs and target references; no temporary page is persisted.
    const commands=commitSchema.parse({baseVersion:1,mutationId:crypto.randomUUID(),commands:[
      {type:'slide.insert',after:destination,slide:{id:sourceId,name:'组件源',sourcePath:`${sourceId}.html`,html,components:[component]}},
      {type:'elements.transfer',slideId:destination,sourceSlideId:sourceId,targets:['reveal-root'],offset:{x:0,y:0},rectangles:[{id:'reveal-root',x:120,y:160,width:640,height:340}]},
      {type:'slide.delete',slideId:sourceId},
    ]}).commands;
    await context.commands(commands);await context.whenReady();
    const created=(context.slide().components ?? []).find(c=>!old.has(c.id));if(created)context.choose(created.root);
  }));
  el('save-reveal').addEventListener('click',()=>void run(async()=>{
    const c=current();if(!c)return;const {button,answer}=parts(c);
    const component=structuredClone(c);component.name=val('reveal-name');component.initial=val('reveal-initial');
    for(const state of component.states) if(state.id==='closed'||state.id==='open') state.patches[button.id]={...state.patches[button.id],text:val(state.id==='closed'?'reveal-closed-label':'reveal-open-label')};
    component.steps=component.steps.map(step=>step.step===0?{...step,state:component.initial}:step);
    await context.commands([{type:'element.patch',slideId:context.slide().id,target:answer.id,patch:{text:val('reveal-answer')}},{type:'component.set',slideId:context.slide().id,component}]);
  }));
  return {render};
}
