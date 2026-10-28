import {contentProperties,type ContentProperty,type MotaleContentEditor} from './motale-content';
import {inspectorSection,inspectorView} from './inspector-view';
import {sidebar} from '../state/sidebar';
import type {FilmMotaleAuthor,FilmMotaleEasing} from '@notale/editor/film';
import {motaleStructureKey,type motaleStructure,type MotaleStructureAction} from './motale-structure';
import type {FilmPreview} from './preview';
import type {MotalePropState,MotaleBridgeObject} from './motale-bridge';
import {translateUi as t} from '../i18n/store';
import {additiveSelection} from './selection-modifiers';
import {bindNumericScrub} from '../state/numeric-scrub';
import {motaleDefaults as defaults,motalePropertyLabels as labels,sampleMotaleValue as sample,isMotaleKeys as keyed,sameMotaleTime as sameTime,writeMotaleValue,addMotaleKey,editMotaleKey,intersectMotaleProps,type MotaleProperty as Property,type MotaleValue} from './motale-keyframes';
import './motale-inspector.css';
type Context=NonNullable<ReturnType<FilmPreview['motaleContext']>>;
/** Bridge-specific values live in the shared clip inspector; persistence stays in FilmSession. */
export function motaleInspector(o:{content:MotaleContentEditor;layers?:HTMLElement;animation?:HTMLElement;structure:ReturnType<typeof motaleStructure>;context:()=>Context|undefined;author:()=>FilmMotaleAuthor|undefined;scope:()=>string;locked:()=>boolean;editing:()=>boolean;edit:(value:boolean)=>void;selected:()=>string[];select:(ids:string[])=>void;seek:(sourceTime:number)=>void;commit:(author:FilmMotaleAuthor)=>boolean}){
 const node=document.createElement('section');node.className='film-motale-inspector';node.setAttribute('aria-label',t('场景对象'));
 const header=document.createElement('div');header.className='film-motale-heading';const heading=document.createElement('strong');heading.textContent=t('场景对象');const mode=document.createElement('button');mode.type='button';mode.title=t('编辑场景对象');mode.setAttribute('aria-label',mode.title);mode.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 3 6 17 3-7 7-3Z"/></svg>';header.append(heading,mode);
 const body=document.createElement('div'),status=document.createElement('p');status.className='film-motale-status';status.setAttribute('role','status');node.append(header,body,status);
 let disposed=false,last='',instance:Context['instance']|undefined,cleanup:(()=>void)[]=[],cancelEdit:(()=>void)|undefined;
 const view=inspectorView(node);const expanded=new Map<string,boolean>();let objectScroll=0,keyScroll=0,committedRevision=-1;
 const issue=(error:unknown)=>{const detail=error&&typeof error==='object'?error as {message?:unknown;path?:unknown}:undefined;status.textContent=[detail?.path, t(typeof detail?.message==='string'?detail.message:String(error))].filter(Boolean).join(': ');};
 body.onkeydown=e=>{if((e.target as HTMLElement)?.closest('.film-motale-structure')){const command=motaleStructureKey(e);if(command){e.preventDefault();e.stopPropagation();if(!e.repeat)structureCommand(command);return;}}if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Delete','Backspace'].includes(e.key))e.stopPropagation();};
 const attempt=(fn:()=>void)=>{try{fn();status.textContent='';}catch(error){issue(error);}};
 function structureCommand(command:MotaleStructureAction){
  const host=node.parentElement,focused=document.activeElement as HTMLElement|null,fromList=!!focused?.closest('.film-motale-objects'),tool=focused?.dataset.motaleAction;
  cancelEdit?.();o.structure.run(command);refresh(true);
  // Commands rebuild the shared inspector. Restore its keyboard focus after
  // the next preview tick has installed the candidate's new object IDs.
  if(fromList||tool)requestAnimationFrame(()=>{
   const panel=fromList?o.layers:host?.querySelector('.film-motale-inspector');if(!panel||document.activeElement!==document.body&&!panel.contains(document.activeElement))return;
   const target=tool?panel.querySelector<HTMLButtonElement>(`[data-motale-action="${tool}"]:not(:disabled)`):undefined;
   (target??panel.querySelector<HTMLButtonElement>('.film-motale-objects [aria-selected=true],.film-motale-objects button[tabindex="0"]')??panel.querySelector<HTMLButtonElement>('.film-motale-heading button'))?.focus({preventScroll:true});
  });
 }

 const stamp=()=>{const context=o.context();return context?{context,scope:o.scope(),time:context.time,selection:[...o.selected()]}:undefined;};
 type Origin=NonNullable<ReturnType<typeof stamp>>;
 const assert=(origin:Origin)=>{const now=o.context();if(disposed||!now||!!now.error||now.bridge.mode()!=='author'||o.locked()||!o.editing()||now.instance!==origin.context.instance||now.act.id!==origin.context.act.id||!sameTime(now.time,origin.time)||o.scope()!==origin.scope||JSON.stringify(o.selected())!==JSON.stringify(origin.selection))throw Error(t('场景或编辑位置已变化，请重新操作'));return now;};
 function draft(context:Context){const doc=structuredClone(o.author()??{schema:context.hello.authorSchema,acts:{}});doc.film??=context.hello.film;doc.acts[context.act.id]??={};if(context.act.revision)doc.acts[context.act.id].revision??=context.act.revision;return doc;}
 function validate(origin:Origin,doc:FilmMotaleAuthor){const context=assert(origin),problems=context.bridge.author.check(doc);if(problems.length)throw Error(problems.map(p=>[p.path,p.message].filter(Boolean).join(': ')).join('; '));return context;}
 function write(origin:Origin,doc:FilmMotaleAuthor){const context=validate(origin,doc);context.bridge.author.cancelPreview();if(!o.commit(doc))throw Error(t('场景修改未保存'));}
 function capability(context:Context,id:string,property:Property,objects:MotaleBridgeObject[]=context.bridge.objects(context.act.id,context.time,{parameters:'film'})){const spec=objects.find(object=>object.id===id)?.props[property];if(!spec)throw Error(t('所选对象不支持此属性'));return spec;}
 function preview(origin:Origin,doc:FilmMotaleAuthor){try{validate(origin,doc).bridge.author.preview(doc);}catch(error){try{origin.context.bridge.author.cancelPreview();}catch{}throw error;}}
 function mutate(origin:Origin,property:Property,value:MotaleValue,relative=false){const doc=draft(assert(origin)),act=doc.acts[origin.context.act.id];if(!origin.selection.length)throw Error(t('请选择对象'));act.objects??={};const objects=origin.context.bridge.objects(origin.context.act.id,origin.time,{parameters:'film'});
  for(const id of origin.selection){const props=act.objects[id]??={},spec=capability(origin.context,id,property,objects);writeMotaleValue(props,property,relative?Number(sample(props[property],spec.base as MotaleValue,origin.time))+Number(value):value,origin.time,spec);}return doc;
 }
 function icon(name:string,path:string,action:()=>void){const button=document.createElement('button');button.type='button';button.title=t(name);button.setAttribute('aria-label',t(name));button.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;button.onclick=()=>attempt(action);return button;}
 function numeric(label:string,value:number|undefined,limits:{min?:number;max?:number;step?:number},change:(origin:Origin,value:number,relative?:boolean)=>FilmMotaleAuthor,batch:number[]=[]){
  const row=document.createElement('label');row.className='film-control-row';const caption=document.createElement('span');caption.textContent=t(label);const input=document.createElement('input');input.type='number';input.step=String(limits.step??1);if(limits.min!==undefined)input.min=String(limits.min);if(limits.max!==undefined)input.max=String(limits.max);input.value=value===undefined?'':String(Number(value.toPrecision(10)));input.placeholder=value===undefined?'—':'';input.setAttribute('aria-label',t(label));row.append(caption,input);
  let origin:Origin|undefined,start=input.value,scrubbing=false,relativeGesture=false;
  const begin=()=>{if(!origin){origin=stamp();start=input.value;if(origin)cancelEdit=cancel;}};
  const cancel=()=>{const old=origin;origin=undefined;scrubbing=relativeGesture=false;if(cancelEdit===cancel)cancelEdit=undefined;input.value=start;if(old)try{old.context.bridge.author.cancelPreview();}catch{};};
  const read=()=>{const value=Number(input.value);if(!input.value.trim()||!Number.isFinite(value)||!relativeGesture&&(limits.min!==undefined&&value<limits.min||limits.max!==undefined&&value>limits.max))throw Error(t('数值超出有效范围'));return relativeGesture?value-Number(start||0):value;};
  const show=()=>{if(!origin)return;try{preview(origin,change(origin,read(),relativeGesture));}catch(error){try{origin.context.bridge.author.cancelPreview();}catch{}throw error;}};
  const commit=()=>{const old=origin;if(!old)return;try{if(input.value===start){cancel();return;}const doc=change(old,read(),relativeGesture);validate(old,doc);origin=undefined;relativeGesture=false;if(cancelEdit===cancel)cancelEdit=undefined;write(old,doc);}catch(error){cancel();throw error;}};
  input.onfocus=begin;input.oninput=()=>{begin();attempt(show);};input.onchange=()=>{if(!scrubbing)attempt(commit);};input.onblur=()=>{if(!scrubbing)attempt(commit);};
  input.onkeydown=e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();cancel();input.blur();}else if(e.key==='Enter'){e.preventDefault();attempt(commit);input.blur();}};
  cleanup.push(bindNumericScrub(input,{read:()=>input.value||'0',limits:()=>batch.length>1?{...limits,min:limits.min===undefined?undefined:Number(start||0)+Math.max(...batch.map(v=>limits.min!-v)),max:limits.max===undefined?undefined:Number(start||0)+Math.min(...batch.map(v=>limits.max!-v))}:limits,start:()=>{begin();scrubbing=true;relativeGesture=batch.length>1;},change:value=>{input.value=value;attempt(show);},finish:aborted=>{scrubbing=false;if(aborted)cancel();else attempt(commit);}}));
  cleanup.push(cancel);return row;
 }
 function field(label:string,value:MotaleValue|undefined,spec:MotalePropState,change:(origin:Origin,value:MotaleValue)=>FilmMotaleAuthor){
  const checkbox=spec.type==='boolean',multiline=['string','tex','numbers'].includes(spec.type),input=multiline?document.createElement('textarea'):document.createElement('input');input.setAttribute('aria-label',t(label));
  if(input instanceof HTMLTextAreaElement){input.rows=2;input.spellcheck=spec.type==='string';if(spec.maxLength!==undefined)input.maxLength=spec.maxLength;}
  else{input.type=checkbox?'checkbox':'text';if(checkbox){input.checked=value===true;input.indeterminate=value===undefined;}else input.maxLength=7;}
  input.value=value===undefined||value===null?'':Array.isArray(value)?value.join(', '):String(value);if(!checkbox)input.placeholder=value===undefined?'—':spec.type==='color'?t('原始颜色'):'';
  let origin:Origin|undefined,start=input.value,checked=value===true,indeterminate=value===undefined,composing=false;
  const begin=()=>{if(!origin){origin=stamp();start=input.value;if(origin)cancelEdit=cancel;}};
  const cancel=()=>{const old=origin;origin=undefined;if(cancelEdit===cancel)cancelEdit=undefined;input.value=start;input.removeAttribute('aria-invalid');if(checkbox){(input as HTMLInputElement).checked=checked;(input as HTMLInputElement).indeterminate=indeterminate;}if(old)try{old.context.bridge.author.cancelPreview();}catch{};};
  const read=():MotaleValue=>{if(checkbox)return (input as HTMLInputElement).checked;if(spec.type==='color')return input.value.trim()||null;if(spec.type!=='numbers')return input.value;const text=input.value.trim();try{const values=text.startsWith('[')?JSON.parse(text):text?text.split(/[,，\s]+/).map(token=>token?Number(token):NaN):[];if(!Array.isArray(values)||values.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw Error();return values;}catch{throw Error(t('请输入有效的数字数组'));}};
  const run=(action:()=>void)=>{try{action();input.removeAttribute('aria-invalid');status.textContent='';}catch(error){input.setAttribute('aria-invalid','true');try{origin?.context.bridge.author.cancelPreview();}catch{}issue(error);}};
  const show=()=>{begin();if(origin)preview(origin,change(origin,read()));};
  const commit=()=>{const at=origin;if(!at)return;if(checkbox?(input as HTMLInputElement).checked===checked&&(input as HTMLInputElement).indeterminate===indeterminate:input.value===start){cancel();return;}const doc=change(at,read());write(at,doc);origin=undefined;start=input.value;checked=checkbox&&(input as HTMLInputElement).checked;indeterminate=false;if(cancelEdit===cancel)cancelEdit=undefined;};
  input.onfocus=begin;input.oninput=()=>{if(!checkbox&&!composing)run(show);};input.addEventListener('compositionstart',()=>{composing=true;});input.addEventListener('compositionend',()=>{composing=false;run(show);});
  input.onchange=()=>{begin();run(commit);};input.onblur=()=>{if(!composing)run(commit);};
  input.onkeydown=e=>{e.stopPropagation();if(e.isComposing)return;if(e.key==='Escape'){e.preventDefault();cancel();status.textContent='';input.blur();}else if(e.key==='Enter'&&!checkbox&&!e.shiftKey){e.preventDefault();run(commit);if(!input.hasAttribute('aria-invalid'))input.blur();}};
  cleanup.push(cancel);return input;
 }
 function keyEdit(origin:Origin,id:string,property:Property,time:number,change:Parameters<typeof editMotaleKey>[3]){const doc=draft(assert(origin)),props=doc.acts[origin.context.act.id].objects?.[id];if(!props)throw Error(t('关键帧已变化，请重新选择'));editMotaleKey(props,property,time,change,capability(origin.context,id,property));return doc;}
 function keyframes(context:Context,ids:string[],objects:MotaleBridgeObject[]){
  const list=document.createElement('div');list.className='film-motale-key-list';list.onscroll=()=>{keyScroll=list.scrollTop;};
  for(const property of Object.keys(defaults) as Property[]){const rows=ids.flatMap(id=>{const spec=objects.find(object=>object.id===id)?.props[property],value=o.author()?.acts[context.act.id]?.objects?.[id]?.[property];return spec?.keyable&&keyed(value)?value.keys.map(key=>({id,key,spec})):[];});if(!rows.length)continue;
   const group=document.createElement('details');group.className='film-motale-key-group';group.dataset.property=property;group.open=expanded.get(property)??true;group.ontoggle=()=>expanded.set(property,group.open);const summary=document.createElement('summary');summary.textContent=t(labels[property]);group.append(summary);
   for(const {id,key,spec}of rows){const [time,value,easing]=key,row=document.createElement('div');row.className='film-motale-key-row';row.dataset.object=id;row.dataset.property=property;row.dataset.sourceTime=String(time);row.dataset.current=String(sameTime(context.time,time));
    if(ids.length>1){const name=document.createElement('span');name.className='film-motale-key-object';name.textContent=id;row.append(name);}
    const seek=icon('定位关键帧','M4 12h14m-5-5 5 5-5 5',()=>{cancelEdit?.();o.seek(context.act.start+time);});seek.dataset.keyAction='seek';seek.onkeydown=e=>{if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();e.stopPropagation();attempt(()=>{const origin=stamp();if(origin)write(origin,keyEdit(origin,id,property,time,null));});}};
    const timeRow=numeric('关键帧时间（幕内源秒）',time,{min:0,max:context.act.end-context.act.start,step:.001},(origin,value)=>keyEdit(origin,id,property,time,{time:value}));const timeInput=timeRow.querySelector('input')!;timeInput.dataset.keyField='time';timeInput.title=t('关键帧时间（幕内源秒）');
    let valueInput:HTMLInputElement|HTMLTextAreaElement;if(typeof value==='number'){valueInput=numeric('关键帧值',value,{min:spec.min,max:spec.max,step:['scale','opacity'].includes(property)?.01:1},(origin,next)=>keyEdit(origin,id,property,time,{value:next})).querySelector('input')!;}else valueInput=field('关键帧值',value,spec,(origin,next)=>keyEdit(origin,id,property,time,{value:next}));valueInput.dataset.keyField='value';valueInput.title=t('关键帧值');
    const ease=document.createElement('select');ease.dataset.keyField='easing';ease.setAttribute('aria-label',t('到下一关键帧的缓动'));ease.title=t('到下一关键帧的缓动');for(const [v,label]of [['linear','线性'],['smooth','平滑'],['step','保持']])if(typeof value==='number'||v==='step')ease.append(new Option(t(label),v));ease.value=typeof value==='number'?easing??'linear':'step';ease.disabled=typeof value!=='number';ease.onchange=()=>attempt(()=>{const origin=stamp();if(origin)write(origin,keyEdit(origin,id,property,time,{easing:ease.value as FilmMotaleEasing}));});
    const remove=icon('删除关键帧','M6 6l12 12M18 6 6 18',()=>{const origin=stamp();if(origin)write(origin,keyEdit(origin,id,property,time,null));});remove.dataset.keyAction='delete';row.append(seek,timeInput,valueInput,ease,remove);group.append(row);
   }list.append(group);
  }
  if(list.childElementCount){const title=document.createElement('strong');title.className='film-motale-key-heading';title.textContent=t('关键帧（源秒）');(o.animation??body).append(title,list);list.scrollTop=keyScroll;}
 }
 function build(context:Context){
  const objects=context.bridge.objects(context.act.id,context.time,{parameters:'film'}).filter(obj=>obj.editable),ids=o.selected().filter(id=>objects.some(obj=>obj.id===id));
  const list=document.createElement('div');list.className='film-motale-objects';list.setAttribute('role','listbox');list.setAttribute('aria-multiselectable','true');list.setAttribute('aria-label',t('场景对象'));list.onscroll=()=>{objectScroll=list.scrollTop;};
  const choose=(id:string,toggle:boolean)=>{cancelEdit?.();o.select(toggle?ids.includes(id)?ids.filter(value=>value!==id):[...ids,id]:[id]);refresh(true);(o.layers??body).querySelector<HTMLButtonElement>(`[data-motale-object="${CSS.escape(id)}"]`)?.focus({preventScroll:true});};
  for(const object of objects){const button=document.createElement('button');button.type='button';button.setAttribute('role','option');button.dataset.motaleObject=object.id;button.setAttribute('aria-selected',String(ids.includes(object.id)));button.tabIndex=object.id===(ids[0]??objects[0]?.id)?0:-1;button.title=object.name??object.text??object.id;button.textContent=object.name??object.text??object.id;button.onclick=e=>choose(object.id,additiveSelection(e));list.append(button);}
  list.onkeydown=e=>{const command=motaleStructureKey(e);if(command){e.preventDefault();e.stopPropagation();if(!e.repeat)structureCommand(command);return;}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){e.preventDefault();e.stopPropagation();cancelEdit?.();o.select(objects.map(obj=>obj.id));refresh(true);return;}if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();const buttons=[...list.querySelectorAll('button')],index=buttons.indexOf(document.activeElement as HTMLButtonElement),next=e.key==='Home'?0:e.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,index+(e.key==='ArrowDown'?1:-1)));buttons[next]?.focus();};(o.layers??body).append(list);list.scrollTop=objectScroll;
  if(context.act.structure){
   const tools=document.createElement('div');tools.className='film-actions film-motale-structure';
   const commands:[MotaleStructureAction,string,string,string][]=[
    ['copy','复制对象','Ctrl/Cmd+C','M8 8h12v12H8zM4 16V4h12'],
    ['cut','剪切对象','Ctrl/Cmd+X','M8 8l12 12M8 16 20 4M8 6a3 3 0 1 0 0 .1M8 18a3 3 0 1 0 0 .1'],
    ['paste','粘贴对象','Ctrl/Cmd+V','M8 5H5v16h14V5h-3M8 3h8v4H8z'],
    ['duplicate','创建对象副本','Ctrl/Cmd+D','M8 8h12v12H8zM4 16V4h12M11 14h6m-3-3v6'],
    ['remove','删除对象','Delete','M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7'],
   ];
   for(const [command,label,shortcut,path]of commands){const button=icon(label,path,()=>{});button.dataset.motaleAction=command;const why=o.structure.reason(command);button.disabled=!!why;button.title=t(label)+' · '+shortcut+(why?' · '+t(why):'');button.onclick=()=>structureCommand(command);tools.append(button);}
   (o.layers??body).append(tools);
  }
  heading.textContent=ids.length===1?(objects.find(object=>object.id===ids[0])?.name??objects.find(object=>object.id===ids[0])?.text??ids[0]):ids.length?`${ids.length} ${t('个对象')}`:t('场景对象');
  const content=inspectorSection(t('内容'),'motale-content',true),appearance=inspectorSection(t('外观'),'motale-appearance',true),geometry=inspectorSection(t('位置与尺寸'),'motale-geometry',false);
  if(ids.length){
   for(const {property,spec} of intersectMotaleProps(objects.filter(object=>ids.includes(object.id)))){const values=ids.map(id=>sample(o.author()?.acts[context.act.id]?.objects?.[id]?.[property],objects.find(object=>object.id===id)!.props[property].base as MotaleValue,context.time)),mixed=values.some(value=>JSON.stringify(value)!==JSON.stringify(values[0])),current=mixed?undefined:values[0],line=document.createElement('div');line.className='film-motale-property';line.dataset.motaleProperty=property;line.dataset.keyable=String(spec.keyable);let row:HTMLElement;
    if((contentProperties as readonly string[]).includes(property)){const field=o.content.field(ids,property as ContentProperty,spec,current);row=field.node;cleanup.push(field.dispose);}
    else if(spec.type==='number')row=numeric(labels[property],current===undefined?undefined:Number(current),{min:spec.min,max:spec.max,step:['scale','opacity'].includes(property)?.01:1},(origin,value,relative)=>mutate(origin,property,value,relative),values.map(Number));
    else{const label=document.createElement('label');label.className=['string','tex','numbers'].includes(spec.type)?'film-control-wide film-motale-content':'film-control-row';const caption=document.createElement('span');caption.textContent=t(labels[property]);label.append(caption,field(labels[property],current,spec,(origin,value)=>mutate(origin,property,value)));row=label;}
    line.append(row);
    if(spec.keyable){const everyKey=ids.every(id=>{const old=o.author()?.acts[context.act.id]?.objects?.[id]?.[property];return keyed(old)&&old.keys.some(k=>sameTime(k[0],context.time));});
     const key=icon(everyKey?'移除当前关键帧':'添加当前关键帧','m12 4 8 8-8 8-8-8Z',()=>{const origin=stamp();if(!origin)return;const doc=draft(assert(origin)),act=doc.acts[context.act.id];act.objects??={};const objects=origin.context.bridge.objects(origin.context.act.id,origin.time,{parameters:'film'});for(const id of origin.selection){const props=act.objects[id]??={},cap=capability(origin.context,id,property,objects);if(everyKey)editMotaleKey(props,property,origin.time,null,cap);else addMotaleKey(props,property,origin.time,cap);}write(origin,doc);});key.setAttribute('aria-pressed',String(everyKey));key.dataset.motaleKey=property;line.append(key);
    }(['text','tex','value','values'].includes(property)?content:['x','y','scale','rotate'].includes(property)?geometry:appearance).append(line);
   }
   for(const group of [content,appearance,geometry])if(group.children.length>1)body.append(group);
   const reset=icon('重置所选对象','M4 10a8 8 0 1 1 1 8M4 4v6h6',()=>{const origin=stamp();if(!origin)return;const doc=draft(assert(origin));for(const id of origin.selection)delete doc.acts[context.act.id].objects?.[id];write(origin,doc);});const tools=document.createElement('div');tools.className='film-actions';tools.append(reset);geometry.append(tools);keyframes(context,ids,objects);
  }
  const windows=context.act.windows?context.bridge.windows(context.act.id):[];
  if(windows.length){const section=inspectorSection(t('观众交互'),'motale-windows');
   for(const window of windows){const group=document.createElement('div');group.className='film-motale-window';const title=document.createElement('strong');title.textContent=window.label??window.key;group.append(title);
    const fields:[string,string,number,{min?:number;max?:number;step?:number}][]=[['from','开始（源秒）',window.from,{min:0,max:context.act.end-context.act.start,step:.1}],['until','结束（源秒）',window.until,{min:0,max:context.act.end-context.act.start,step:.1}],['handback','交还时长（秒）',window.handback,{min:0,step:.1}]];
    if(window.range)fields.push(['min','最小值',window.range[0],{step:.1}],['max','最大值',window.range[1],{step:.1}]);if(window.step!==null)fields.push(['step','步长',window.step,{min:.000001,step:.1}]);
    for(const [field,label,value,limits] of fields)group.append(numeric(label,value,limits,(origin,next)=>{
     const doc=draft(assert(origin)),act=doc.acts[context.act.id];act.windows??={};const patch=act.windows[window.key]??={};
     if(field==='min'||field==='max'){const range:[number,number]=[...(patch.range??window.range!)];range[field==='min'?0:1]=next;if(range[0]>=range[1])throw Error(t('最小值必须小于最大值'));patch.range=range;}else Reflect.set(patch,field,next);
     if((patch.from??window.from)>=(patch.until??window.until))throw Error(t('交互开始必须早于结束'));return doc;
    }));section.append(group);
   }body.append(section);
  }
  if(o.locked())for(const control of body.querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLSelectElement|HTMLTextAreaElement>('input,select,textarea,.film-motale-property button,.film-actions button,[data-key-action=delete]'))control.disabled=true;
 } function refresh(force=false){if(disposed||o.content.editing)return;const context=o.context(),editing=o.editing(),state=context?.bridge.state();if(!cancelEdit&&!state?.previewing)committedRevision=state?.authorRevision??-1;const next=JSON.stringify([committedRevision,context?.act.id,context?.time,context?.error,o.scope(),o.locked(),editing,o.selected()]);if(!force&&instance===context?.instance&&last===next)return;last=next;instance=context?.instance;
  const restore=view.capture(JSON.stringify([context?.act.id,o.selected()]),'motale');
  cancelEdit?.();cleanup.splice(0).reverse().forEach(fn=>fn());body.replaceChildren();o.layers?.replaceChildren();o.animation?.replaceChildren();status.textContent='';mode.disabled=o.locked()||!!context?.error||!context?.act.objects||!context?.act.author;mode.setAttribute('aria-pressed',String(editing));mode.hidden=editing;body.hidden=!editing;
  if(!context){status.textContent=t('当前场景尚未提供编辑桥接');return;}if(context.error){status.textContent=context.error;return;}if(!context.act.objects||!context.act.author){status.textContent=t('当前场景仅支持播放');return;}if(editing)attempt(()=>build(context));restore();
 }
 const layers=icon('打开图层','m12 3 9 5-9 5-9-5Zm-9 9 9 5 9-5m-18 5 9 5 9-5',()=>sidebar.inspect('objects'));header.insertBefore(layers,mode);
 mode.onclick=()=>attempt(()=>{cancelEdit?.();o.edit(!o.editing());refresh(true);});refresh();
 return {node,refresh,dispose(){disposed=true;cancelEdit?.();cleanup.splice(0).reverse().forEach(fn=>fn());o.layers?.replaceChildren();o.animation?.replaceChildren();}};
}
