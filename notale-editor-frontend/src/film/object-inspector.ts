import {attachColorPicker} from './color-picker.js';
import {objectStyles} from './object-styles.js';
import {overlayStructure} from './overlay-structure.js';
import {clipObjects,validFilmStyleName,type FilmClip,type FilmCommand,type FilmEasing} from '@notale/editor/film';
import {cleanOverlayHtml} from './overlay-page.js';
import {curves} from './appearance-inspector.js';
const properties:Record<string,string>={translate:'偏移',rotate:'旋转',scale:'缩放',width:'宽度',height:'高度',left:'左侧位置',top:'顶部位置',opacity:'透明度',color:'文字颜色','background-color':'填充颜色',fill:'SVG 填充',stroke:'SVG 描边','stroke-width':'描边宽度','font-family':'字体','font-size':'字号','font-weight':'字重','font-style':'字形','line-height':'行高','letter-spacing':'字距','text-align':'对齐','text-decoration':'文字装饰',filter:'滤镜','mix-blend-mode':'混合模式','border-radius':'圆角','box-shadow':'阴影','clip-path':'裁切路径',visibility:'可见性',display:'显示',transform:'变换矩阵'};
export function objectInspector(options:{clip:FilmClip;html:string;target?:string;property:string;locked:boolean;position:()=>number;select:(id:string)=>void;propertySelect:(property:string)=>void;commands:(commands:FilmCommand[])=>boolean;seek:(frame:number)=>void;preview:()=>void;base:(id:string,property:string)=>string|undefined}){
 const root=document.createElement('section');root.className='film-object-inspector';root.setAttribute('aria-label','叠加对象');
 const doc=new DOMParser().parseFromString(cleanOverlayHtml(options.html),'text/html'),nodes=[...doc.body.querySelectorAll<HTMLElement>('[data-notale-id]')];
 const id=nodes.some(n=>n.dataset.notaleId===options.target)?options.target!:nodes[0]?.dataset.notaleId;
 const node=nodes.find(n=>n.dataset.notaleId===id),clip=options.clip,property=options.property;
 const label=(text:string,child:HTMLElement)=>{const row=document.createElement('label');row.append(text,child);return row;};
 const objects=document.createElement('select');objects.setAttribute('aria-label','叠加对象');
 for(const n of nodes){let depth=0,parent=n.parentElement;while(parent&&parent!==doc.body){depth++;parent=parent.parentElement;}const option=new Option(`${'· '.repeat(depth)}${n.textContent?.trim().slice(0,28)||n.tagName.toLowerCase()}`,n.dataset.notaleId);option.title=n.dataset.notaleId!;objects.append(option);}
 objects.value=id??'';objects.onchange=()=>options.select(objects.value);root.append(label('对象',objects));
 if(!id||!node)return {node:root,refresh:()=>{}};
 const object=clip.objects?.[id],keys=object?.keyframes?.[property]??[];
 let ancestor=node.parentElement,ancestorLocked=false;while(ancestor&&ancestor!==doc.body){if(clip.objects?.[ancestor.dataset.notaleId??'']?.locked)ancestorLocked=true;ancestor=ancestor.parentElement;}
 const locked=options.locked||!!object?.locked||ancestorLocked;
 const lock=document.createElement('input');lock.type='checkbox';lock.checked=!!object?.locked;lock.disabled=options.locked||ancestorLocked;lock.setAttribute('aria-label','锁定对象');lock.onchange=()=>options.commands([{type:'film.object.lock',clipId:clip.id,target:id,locked:lock.checked}]);root.append(label('锁定对象',lock));
 const structure=document.createElement('div');structure.className='film-actions';
 for(const [action,title,text] of [['front','置顶','⇈'],['forward','上移一层','↑'],['backward','下移一层','↓'],['back','置底','⇊'],['duplicate','复制对象','⧉'],['delete','删除对象','×']] as const){const b=document.createElement('button');b.textContent=text;b.title=title;b.setAttribute('aria-label',title);b.disabled=locked;b.onclick=()=>{try{options.preview();const result=overlayStructure(clip,options.html,id,action,options.position());if(options.commands([result.command])&&result.selected)options.select(result.selected);}catch(error){issue.textContent=String(error);issue.hidden=false;}};structure.append(b);}root.append(structure);
 const read=(name:string)=>clipObjects(clip,options.position()-clip.at)[id!]?.[name]??options.base(id!,name)??node.style.getPropertyValue(name);
 const quick=objectStyles({locked,read:name=>read(name)??'',write:(name,value)=>{if(!CSS.supports(name,value))return;options.preview();const keys=object?.keyframes?.[name],frame=options.position()-clip.at+(clip.animationOffset??0);options.commands([keys?.length?{type:'film.object.key.put',clipId:clip.id,target:id,property:name,keyframe:{frame,value,easing:keys.find(k=>k.frame===frame)?.easing??'linear'}}:{type:'film.object.property',clipId:clip.id,target:id,property:name,value}]);}});root.append(quick.node);
 const menu=document.createElement('select');menu.setAttribute('aria-label','对象属性');menu.append(...Object.entries(properties).map(([value,title])=>new Option(title,value)),new Option('其他 CSS 属性','custom'));menu.value=Object.hasOwn(properties,property)?property:'custom';
 menu.onchange=()=>options.propertySelect(menu.value==='custom'?'--custom':menu.value);root.append(menu);
 if(menu.value==='custom'){const name=document.createElement('input');name.setAttribute('aria-label','CSS 属性名');name.value=property;name.onchange=()=>{if(validFilmStyleName(name.value))options.propertySelect(name.value);else {name.setCustomValidity('请输入 CSS 属性名；动画与过渡由关键帧控制');name.reportValidity();}};name.oninput=()=>name.setCustomValidity('');root.append(label('CSS 属性名',name));}
 const input=document.createElement('input');input.setAttribute('aria-label','对象属性值');input.disabled=locked;input.placeholder='例如 24px / #ffffff';
 const at=()=>options.position()-clip.at+(clip.animationOffset??0),key=()=>keys.find(k=>k.frame===at());
 const value=()=>clipObjects(clip,options.position()-clip.at)[id]?.[property]??options.base(id,property)??node.style.getPropertyValue(property);
 const issue=document.createElement('p');issue.setAttribute('role','status');issue.hidden=true;
 const apply=(commands:FilmCommand[])=>{options.preview();return options.commands(commands);};
 function put(v:string){return apply([{type:'film.object.key.put',clipId:clip.id,target:id!,property,keyframe:{frame:at(),value:v,easing:key()?.easing??'linear'}}]);}
 input.onfocus=options.preview;
 input.onchange=()=>{
  if(!input.value||!CSS.supports(property,input.value)){issue.textContent='该属性值不能用于此 CSS 属性';issue.hidden=false;return;}
  issue.hidden=true;if(keys.length)put(input.value);else apply([{type:'film.object.property',clipId:clip.id,target:id!,property,value:input.value}]);
 };
 root.append(label('对象属性值',input),issue);const colorPicker=['color','background-color','fill','stroke','border-color'].includes(property)?attachColorPicker(input,'对象属性颜色'):undefined;
 const tools=document.createElement('div');tools.className='film-actions';
 const button=(title:string,text:string,action:()=>void)=>{const b=document.createElement('button');b.textContent=text;b.title=title;b.setAttribute('aria-label',title);b.onclick=action;tools.append(b);return b;};
 const add=button('添加对象关键帧','◆',()=>{const v=value();if(v)put(v);});
 const remove=button('删除对象当前关键帧','◇',()=>apply([{type:'film.object.key.delete',clipId:clip.id,target:id!,property,frame:at()}]));
 const reset=button('重置对象静态属性','↺',()=>apply([{type:'film.object.property',clipId:clip.id,target:id!,property}]));root.append(tools);
 const ease=document.createElement('select');ease.setAttribute('aria-label','对象关键帧缓动');ease.append(...Object.keys(curves).concat('custom').map(v=>new Option(v==='custom'?'自定义贝塞尔':v,v)));
 const update=(easing:FilmEasing)=>{const current=key();if(current)apply([{type:'film.object.key.put',clipId:clip.id,target:id!,property,keyframe:{...current,easing}}]);};
 ease.onchange=()=>update(ease.value==='custom'?[.25,0,.75,1]:curves[ease.value]);root.append(label('对象关键帧缓动',ease));
 const bezier=document.createElement('div');bezier.className='film-bezier';const coords=['X1','Y1','X2','Y2'].map((name,i)=>{const field=document.createElement('input');field.type='number';field.step='.01';field.setAttribute('aria-label',`对象贝塞尔 ${name}`);if(i%2===0){field.min='0';field.max='1';}field.onchange=()=>update(coords.map(f=>Number(f.value)) as [number,number,number,number]);bezier.append(field);return field;});root.append(bezier);
 const list=document.createElement('div');list.className='film-key-list';
 for(const k of keys){const jump=document.createElement('button');jump.textContent=`${k.frame-(clip.animationOffset??0)} 帧 · ${k.value}`;jump.title='跳到对象关键帧';jump.onclick=()=>options.seek(clip.at+k.frame-(clip.animationOffset??0));list.append(jump);}root.append(list);
 function refresh(){
  quick.refresh();
  if(document.activeElement!==input)input.value=value()??'';colorPicker?.refresh();
  add.disabled=locked||!value();remove.disabled=locked||!key();reset.disabled=locked;ease.disabled=locked||!key();
  add.setAttribute('aria-pressed',String(!!key()));
  if(document.activeElement!==ease)ease.value=Object.keys(curves).find(name=>JSON.stringify(curves[name])===JSON.stringify(key()?.easing??'linear'))??'custom';
  bezier.hidden=ease.value!=='custom';const values=Array.isArray(key()?.easing)?key()!.easing as number[]:[.25,0,.75,1];coords.forEach((field,i)=>{field.disabled=locked||!key();if(document.activeElement!==field)field.value=String(values[i]);});
 }
 refresh();return {node:root,refresh};
}
