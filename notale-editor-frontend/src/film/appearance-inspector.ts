import { clipAppearance, filmAppearanceDefaults, filmEnumValues, filmNumericLimits, type FilmClip, type FilmProperty, type FilmPropertyValue, type FilmCommand, type FilmEasing } from '@notale/editor/film';
const labels:Record<FilmProperty,string>={x:'中心 X',y:'中心 Y',width:'宽度',height:'高度',rotation:'旋转',skewX:'水平斜切',scaleX:'水平缩放',scaleY:'垂直缩放',opacity:'透明度',blur:'模糊',brightness:'亮度',contrast:'对比度',saturation:'饱和度',hue:'色相',radius:'圆角',cropTop:'上裁切 %',cropRight:'右裁切 %',cropBottom:'下裁切 %',cropLeft:'左裁切 %',blendMode:'混合模式',fit:'画面适配',mask:'遮罩'};
export const curves:Record<string,FilmEasing>={linear:'linear',hold:'hold',ease:[.25,.1,.25,1],'ease-in':[.42,0,1,1],'ease-out':[0,0,.58,1],'ease-in-out':[.42,0,.58,1]};
export function appearanceInspector(options:{clip:FilmClip;locked:boolean;property:FilmProperty;position:()=>number;stage:{width:number;height:number};size:()=>{width:number;height:number};select:(property:FilmProperty)=>void;commands:(commands:FilmCommand[])=>boolean;seek:(at:number)=>void;pause:()=>void}) {
  const {clip,property}=options,root=document.createElement('section');root.className='film-appearance';root.setAttribute('aria-label','叠加属性');
  const label=(title:string,node:HTMLElement)=>{const row=document.createElement('label');row.append(title,node);return row;};
  const menu=document.createElement('select');menu.setAttribute('aria-label','叠加属性');
  menu.append(...Object.entries(labels).map(([value,text])=>new Option(text,value)));menu.value=property;menu.onchange=()=>options.select(menu.value as FilmProperty);
  const keys=clip.appearance?.keyframes?.[property]??[];
  const keyAt=()=>options.position()-clip.at+(clip.animationOffset??0);
  const current=()=>keys.find(k=>k.frame===keyAt());
  const fallback=()=>({x:options.stage.width/2,y:options.stage.height/2,...options.size(),...filmAppearanceDefaults})[property]!;
  const valueAt=()=>clipAppearance(clip,options.position()-clip.at)[property]??fallback();
  const enumerated=Object.hasOwn(filmEnumValues,property);
  const value=enumerated?document.createElement('select'):document.createElement('input');value.setAttribute('aria-label','属性值');
  if(value instanceof HTMLSelectElement)value.append(...(filmEnumValues[property as keyof typeof filmEnumValues] as readonly string[]).map(v=>new Option(v,v)));
  else {value.type='number';value.step='any';const [min,max]=filmNumericLimits[property as keyof typeof filmNumericLimits] as readonly number[];if(min!==undefined)value.min=String(min);if(max!==undefined)value.max=String(max);}
  value.onfocus=options.pause;
  const readValue=():FilmPropertyValue=>enumerated?value.value:Number(value.value);
  const put=(newValue:FilmPropertyValue)=>options.commands([{type:'film.keyframe.put',clipId:clip.id,property,keyframe:{frame:keyAt(),value:newValue,easing:current()?.easing??'linear'}}]);
  value.onchange=()=>{if(keys.length)put(readValue());else options.commands([{type:'film.property.set',clipId:clip.id,property,value:readValue()}]);};
  const tools=document.createElement('div');tools.className='film-actions';
  const button=(name:string,text:string,action:()=>void)=>{const b=document.createElement('button');b.type='button';b.title=name;b.setAttribute('aria-label',name);b.textContent=text;b.onclick=action;tools.append(b);return b;};
  const add=button('在播放头添加或更新关键帧','◆',()=>put(valueAt()));
  const remove=button('删除当前关键帧','◇',()=>options.commands([{type:'film.keyframe.delete',clipId:clip.id,property,frame:keyAt()}]));
  const reset=button('重置静态属性','↺',()=>options.commands([{type:'film.property.set',clipId:clip.id,property}]));
  const local=document.createElement('output');local.setAttribute('aria-label','片内帧');tools.append(local);
  const easing=document.createElement('select');easing.setAttribute('aria-label','关键帧缓动');easing.append(...Object.keys(curves).concat('custom').map(v=>new Option(v==='hold'?'保持':v==='custom'?'自定义贝塞尔':v,v)));
  const custom=document.createElement('div');custom.className='film-bezier';
  const coords=Array.from({length:4},(_,i)=>{const input=document.createElement('input');input.type='number';input.step='.01';input.setAttribute('aria-label',`贝塞尔 ${['X1','Y1','X2','Y2'][i]}`);if(i%2===0){input.min='0';input.max='1';}custom.append(input);return input;});
  const curve=(ease:FilmEasing)=>{const key=current();if(key)options.commands([{type:'film.keyframe.put',clipId:clip.id,property,keyframe:{...key,easing:ease}}]);};
  easing.onchange=()=>curve(easing.value==='custom'?[.25,0,.75,1]:curves[easing.value]);
  for(const input of coords)input.onchange=()=>curve(coords.map(v=>Number(v.value)) as [number,number,number,number]);
  const list=document.createElement('div');list.className='film-key-list';list.setAttribute('aria-label','属性关键帧');
  for(const key of keys){
    const row=document.createElement('div'),go=document.createElement('button'),del=document.createElement('button');
    const frame=key.frame-(clip.animationOffset??0);go.textContent=`${frame} 帧 · ${key.value}`;go.title='跳到关键帧';go.onclick=()=>options.seek(clip.at+frame);
    del.disabled=options.locked;del.textContent='×';del.title='删除关键帧';del.setAttribute('aria-label',`删除 ${frame} 帧关键帧`);del.onclick=()=>options.commands([{type:'film.keyframe.delete',clipId:clip.id,property,frame:key.frame}]);row.append(go,del);list.append(row);
  }
  root.append(menu,label('数值',value),tools,label('到下一关键帧的缓动',easing),custom,list);
  function refresh(){
    if(document.activeElement!==value)value.value=String(valueAt());
    value.disabled=options.locked;add.disabled=options.locked;reset.disabled=options.locked;
    const key=current();add.setAttribute('aria-pressed',String(!!key));remove.disabled=options.locked||!key;easing.disabled=options.locked||!key;
    local.value=`${options.position()-clip.at} 帧`;
    if(document.activeElement!==easing)easing.value=Object.keys(curves).find(name=>JSON.stringify(curves[name])===JSON.stringify(key?.easing??'linear'))??'custom';
    custom.hidden=easing.value!=='custom';
    const values=Array.isArray(key?.easing)?key.easing:[.25,.1,.25,1];coords.forEach((node,i)=>{node.disabled=options.locked||!key;if(document.activeElement!==node)node.value=String(values[i]);});
  }
  refresh();return {node:root,refresh};
}
