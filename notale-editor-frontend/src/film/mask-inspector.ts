import {easingLabel} from './ui-locale';
import {translateUi as filmText} from '../i18n/store';
import {clipMasks,filmMaskDefaults,filmMaskNumbers,filmMaskEnums,type FilmClip,type FilmCommand,type FilmMaskProperty,type FilmPropertyValue,type FilmEasing} from '@notale/editor/film';
import {curves} from './appearance-inspector.js';
const names:Record<string,string>={linear:'线性',mirror:'带状',ellipse:'椭圆',rect:'矩形',star:'星形',heart:'心形',add:'相加',subtract:'相减',intersect:'相交',exclude:'排除',normal:'正常',inverse:'反向',on:'开启',off:'关闭'};
const icons:Record<string,string>={linear:'<path d="M3 12h18M5 16h14M5 20h14"/>',mirror:'<path d="M3 7h18M3 17h18M5 12h14"/>',ellipse:'<ellipse cx="12" cy="12" rx="9" ry="6"/>',rect:'<rect x="3" y="5" width="18" height="14" rx="2"/>',star:'<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',heart:'<path d="M12 21 3 12C-3 3 9-1 12 6 15-1 27 3 21 12Z"/>'};
const labels:Record<FilmMaskProperty,string>={shape:'形状',x:'中心 X（%）',y:'中心 Y（%）',width:'宽度（%）',height:'高度（%）',rotation:'旋转（°）',skewX:'斜切（°）',feather:'羽化（源像素）',radius:'圆角（%）',combine:'组合方式',invert:'反向',enabled:'启用'};
export function maskInspector(options:{clip:FilmClip;maskId?:string;property:FilmMaskProperty;locked:boolean;editing:()=>boolean;edit:()=>void;position:()=>number;select:(id:string)=>void;selectProperty:(property:FilmMaskProperty)=>void;commands:(commands:FilmCommand[])=>boolean;seek:(frame:number)=>void;pause:()=>void}){
 const root=document.createElement('section');root.className='film-mask-inspector';root.setAttribute('aria-label',filmText('遮罩堆栈'));
 const label=(title:string,node:HTMLElement)=>{const row=document.createElement('label'),caption=document.createElement('span');row.className='film-control-row';caption.textContent=filmText(title);row.append(caption,node);return row;};
 const title=document.createElement('h3');title.textContent=filmText('遮罩');root.append(title);
 const shapes=document.createElement('div');shapes.className='film-mask-shapes';
 for(const shape of filmMaskEnums.shape){const b=document.createElement('button');b.type='button';b.title=filmText('添加{0}遮罩',{'0':filmText(names[shape])});b.setAttribute('aria-label',b.title);b.disabled=options.locked;b.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[shape]}</svg>`;
  b.onclick=()=>{options.pause();const id=crypto.randomUUID();if(options.commands([{type:'film.mask.add',clipId:options.clip.id,mask:{id,values:{shape}}}]))options.select(id);};shapes.append(b);
 }root.append(shapes);
 const clip=options.clip,mask=clip.masks?.find(m=>m.id===options.maskId)??clip.masks?.[0];if(!mask)return {node:root,refresh:()=>{}};
 const masks=document.createElement('select');masks.setAttribute('aria-label',filmText('当前遮罩'));masks.append(...clip.masks!.map((m,i)=>new Option(`${i+1} · ${filmText(names[String(m.values?.shape??'ellipse')])}`,m.id)));masks.value=mask.id;masks.onchange=()=>options.select(masks.value);root.append(masks);
 const tools=document.createElement('div');tools.className='film-actions';
 const button=(label:string,text:string,action:()=>void)=>{const b=document.createElement('button');b.textContent=filmText(text);b.title=filmText(label);b.setAttribute('aria-label',filmText(label));b.disabled=options.locked;b.onclick=()=>{options.pause();action();};tools.append(b);return b;};
 const edit=button(filmText('在画布编辑遮罩'),'⤢',options.edit);
 const index=clip.masks!.indexOf(mask);
 const up=button(filmText('遮罩上移'),'↑',()=>options.commands([{type:'film.mask.move',clipId:clip.id,maskId:mask.id,index:index-1}]));up.disabled=options.locked||index===0;
 const down=button(filmText('遮罩下移'),'↓',()=>options.commands([{type:'film.mask.move',clipId:clip.id,maskId:mask.id,index:index+1}]));down.disabled=options.locked||index===clip.masks!.length-1;
 button(filmText('删除遮罩'),'×',()=>options.commands([{type:'film.mask.delete',clipId:clip.id,maskId:mask.id}]));root.append(tools);
 const shape=String(mask.values?.shape??'ellipse'),allowed=(p:string)=>p==='radius'?shape==='rect':p==='width'?!['linear','mirror'].includes(shape):p==='height'?shape!=='linear':true;
 const property=allowed(options.property)?options.property:'x',locked=options.locked||(index===0&&property==='combine'),menu=document.createElement('select');menu.setAttribute('aria-label',filmText('遮罩属性'));menu.append(...Object.entries(labels).filter(([p])=>allowed(p)).map(([value,text])=>new Option(filmText(text),value)));menu.value=property;menu.onchange=()=>options.selectProperty(menu.value as FilmMaskProperty);root.append(menu);
 const keys=mask.keyframes?.[property]??[],at=()=>options.position()-clip.at+(clip.animationOffset??0),key=()=>keys.find(k=>k.frame===at());
 // Keep disabled masks editable by sampling a copy with enabled forced on.
 const sample=()=>clipMasks({...clip,masks:[{...mask,values:{...mask.values,enabled:'on'},keyframes:{...mask.keyframes,enabled:undefined}}]},options.position()-clip.at)[0]?.values;
 const value=()=>property==='enabled'?mask.keyframes?.enabled?.reduce((v,k)=>k.frame<=at()?k.value:v,mask.keyframes.enabled[0]?.value??mask.values?.enabled??'on')??mask.values?.enabled??'on':sample()?.[property]??filmMaskDefaults[property];
 const enumerated=Object.hasOwn(filmMaskEnums,property),input=enumerated?document.createElement('select'):document.createElement('input');input.setAttribute('aria-label',filmText('遮罩属性值'));input.disabled=locked;if(index===0&&property==='combine')input.title=filmText('第一项作为基础遮罩');
 if(input instanceof HTMLSelectElement)input.append(...(filmMaskEnums[property as keyof typeof filmMaskEnums] as readonly string[]).map(v=>new Option(filmText(names[v]??v),v)));
 else{input.type='number';input.step='any';const [min,max]=filmMaskNumbers[property as keyof typeof filmMaskNumbers];input.min=String(min);input.max=String(max);}input.onfocus=options.pause;
 const apply=(commands:FilmCommand[])=>{options.pause();return options.commands(commands);};
 const put=(newValue:FilmPropertyValue)=>apply([{type:'film.mask.key.put',clipId:clip.id,maskId:mask.id,property,keyframe:{frame:at(),value:newValue,easing:key()?.easing??'linear'}}]);
 input.onchange=()=>{const value=enumerated?input.value:Number(input.value);if(keys.length)put(value);else apply([{type:'film.mask.property',clipId:clip.id,maskId:mask.id,property,value}]);};root.append(label(filmText('遮罩属性值'),input));
 const keyTools=document.createElement('div');keyTools.className='film-actions';
 const add=document.createElement('button');add.textContent='◆';add.title=filmText('添加遮罩关键帧');add.setAttribute('aria-label',add.title);add.onclick=()=>put(value());
 const remove=document.createElement('button');remove.textContent='◇';remove.title=filmText('删除遮罩当前关键帧');remove.setAttribute('aria-label',remove.title);remove.onclick=()=>apply([{type:'film.mask.key.delete',clipId:clip.id,maskId:mask.id,property,frame:at()}]);
 const reset=document.createElement('button');reset.textContent='↺';reset.title=filmText('重置遮罩静态属性');reset.setAttribute('aria-label',reset.title);reset.disabled=locked;reset.onclick=()=>apply([{type:'film.mask.property',clipId:clip.id,maskId:mask.id,property}]);keyTools.append(add,remove,reset);root.append(keyTools);
 const ease=document.createElement('select');ease.setAttribute('aria-label',filmText('遮罩关键帧缓动'));ease.append(...Object.keys(curves).concat('custom').map(v=>new Option(easingLabel(v),v)));
 const curve=(easing:FilmEasing)=>{const current=key();if(current)apply([{type:'film.mask.key.put',clipId:clip.id,maskId:mask.id,property,keyframe:{...current,easing}}]);};ease.onchange=()=>curve(ease.value==='custom'?[.25,0,.75,1]:curves[ease.value]);root.append(label(filmText('遮罩关键帧缓动'),ease));
 const bezier=document.createElement('div');bezier.className='film-bezier';const coords=['X1','Y1','X2','Y2'].map((name,i)=>{const field=document.createElement('input');field.type='number';field.step='.01';field.setAttribute('aria-label',filmText('遮罩贝塞尔 {0}',{'0':name}));if(i%2===0){field.min='0';field.max='1';}field.onchange=()=>curve(coords.map(f=>Number(f.value)) as [number,number,number,number]);bezier.append(field);return field;});root.append(bezier);
 const list=document.createElement('div');list.className='film-key-list';for(const k of keys){const jump=document.createElement('button');jump.textContent=`${k.frame-(clip.animationOffset??0)} 帧 · ${names[String(k.value)]??k.value}`;jump.title=filmText('跳到遮罩关键帧');jump.onclick=()=>options.seek(clip.at+k.frame-(clip.animationOffset??0));list.append(jump);}root.append(list);
 function refresh(){edit.setAttribute('aria-pressed',String(options.editing()));if(document.activeElement!==input)input.value=String(value());add.disabled=locked;remove.disabled=locked||!key();add.setAttribute('aria-pressed',String(!!key()));ease.disabled=locked||!key();if(document.activeElement!==ease)ease.value=Object.keys(curves).find(name=>JSON.stringify(curves[name])===JSON.stringify(key()?.easing??'linear'))??'custom';bezier.hidden=ease.value!=='custom';const values=Array.isArray(key()?.easing)?key()!.easing as number[]:[.25,0,.75,1];coords.forEach((node,i)=>{node.disabled=locked||!key();if(document.activeElement!==node)node.value=String(values[i]);});}
 refresh();return {node:root,refresh};
}
