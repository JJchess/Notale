import {translateUi as filmText} from '../i18n/store';
import {type FilmClip,type FilmCommand,type FilmSelectorOverride} from '@notale/editor/film';
export function selectorInspector(clip:FilmClip,locked:boolean,execute:(commands:FilmCommand[])=>boolean,report:(text:string)=>void){
 const root=document.createElement('details');root.open=true;const title=document.createElement('summary');title.textContent=filmText('网页对象');root.append(title);const list=clip.openfilm?.original.overrides??[];
 const write=(next:typeof list)=>execute([{type:'film.openfilm.overrides',clipId:clip.id,overrides:next}]);
 for(const [index,override] of list.entries()){if(!('at' in override))continue;const block=document.createElement('fieldset');root.append(block);const legend=document.createElement('legend');legend.textContent=override.at+(override.n?` · ${override.n}`:'');block.append(legend);
  const update=(patch:Partial<FilmSelectorOverride>)=>write(list.map((v,i)=>i===index?{...override,...patch}:v));
  const row=(text:string,input:HTMLElement)=>{const label=document.createElement('label'),caption=document.createElement('span');caption.textContent=text;const toggle=input instanceof HTMLInputElement&&input.type==='checkbox';label.className=toggle?'film-control-toggle':'film-control-wide';label.append(...(toggle?[input,caption]:[caption,input]));input.setAttribute('aria-label',text);block.append(label);};
  const field=(text:string,value:string,change:(value:string)=>void,multiline=false)=>{const input=multiline?document.createElement('textarea'):document.createElement('input');input.value=value;input.disabled=locked||!!override.lock;input.onchange=()=>{try{change(input.value);}catch(error){report(String(error));}};row(text,input);};
  field(filmText('CSS 选择器'),override.at,value=>update({at:value}));field(filmText('第几个匹配（空为全部）'),override.n?.toString()??'',value=>update({n:value?Number(value):undefined}));
  field(filmText('替换文字'),override.text??'',value=>update({text:value}),true);
  for(const [name,key,fallback] of [['平移 X','t',0],['缩放 X','s',1]] as const){const previous=override[key],values=typeof previous==='number'?[previous,previous]:previous??[fallback,fallback];field(name,String(values[0]),value=>update({[key]:[Number(value),values[1]]}));field(name.replace('X','Y'),String(values[1]),value=>update({[key]:[values[0],Number(value)]}));}
  field(filmText('网页对象旋转'),String(override.r??0),value=>update({r:Number(value)}));field(filmText('CSS 样式 JSON'),JSON.stringify(override.style??{},null,2),value=>update({style:JSON.parse(value)}),true);
  const lock=document.createElement('input');lock.type='checkbox';lock.checked=!!override.lock;lock.disabled=locked;lock.onchange=()=>update({lock:lock.checked?true:undefined});row(filmText('锁定网页对象'),lock);
  const remove=document.createElement('button');remove.textContent=filmText('删除覆盖');remove.disabled=locked||!!override.lock;remove.onclick=()=>write(list.filter((_,i)=>i!==index));block.append(remove);
 }
 const add=document.createElement('button');add.textContent=filmText('添加选择器覆盖');add.disabled=locked;add.onclick=()=>{const at=prompt(filmText('CSS 选择器，例如 #title 或 .label'));if(at){try{document.querySelector(at);write([...list,{at}]);}catch(error){report(String(error));}}};root.append(add);return root;
}
