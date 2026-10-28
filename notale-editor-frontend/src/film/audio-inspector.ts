import {inspectorSection} from './inspector-view';
import {easingLabel} from './ui-locale';
import {translateUi as filmText} from '../i18n/store';
import {loudnessControls} from './loudness.js';
import {type FilmClip,type FilmSource,type FilmDocument,type FilmCommand,type FilmAudio,clipGain,secondsFrame,frameSeconds,wordSubtitles,parseWordTimings} from '@notale/editor/film';
import {curves} from './appearance-inspector.js';
export function audioInspector(o:{report?:(text:string)=>void;doc:FilmDocument;clip:FilmClip;source:FilmSource;locked:boolean;position:()=>number;language:()=>string;commands:(c:FilmCommand[])=>boolean;pick:(accept:string,apply:(text:string)=>void)=>void;seek:(at:number)=>void;pause:()=>void}){
 const {clip}=o,root=document.createElement('section');root.className='film-audio-controls';root.setAttribute('aria-label',filmText('声音'));const a=clip.audio??{},keys=a.keys??[],at=()=>o.position()-clip.at+(clip.animationOffset??0);
 const patch=(patch:Partial<FilmAudio>)=>o.commands([{type:'film.audio.set',clipId:clip.id,audio:{...a,...patch}}]);
 const label=(name:string,node:HTMLElement)=>{const row=document.createElement('label'),caption=document.createElement('span');caption.textContent=filmText(name);const toggle=node instanceof HTMLInputElement&&node.type==='checkbox';row.className=toggle?'film-control-toggle':'film-control-row';row.append(...(toggle?[node,caption]:[caption,node]));root.append(row);node.setAttribute('aria-label',filmText(name));};
 const number=(name:string,value:number,change:(v:number)=>void,step='.1',min?:number,max?:number)=>{const input=document.createElement('input');input.type='number';input.step=step;input.value=String(value);if(min!==undefined)input.min=String(min);if(max!==undefined)input.max=String(max);input.disabled=o.locked;input.onfocus=o.pause;input.onchange=()=>change(Number(input.value));label(name,input);return input;};
 const role=document.createElement('select');role.append(new Option(filmText('旁白'),'narration'),new Option(filmText('配乐'),'music'),new Option(filmText('音效'),'sfx'));role.value=a.role??'sfx';role.disabled=o.locked;role.onchange=()=>patch({role:role.value as FilmAudio['role']});label(filmText('声音角色'),role);
 const put=(value:number)=>patch({keys:[...keys.filter(k=>k.frame!==at()),{frame:at(),value,easing:keys.find(k=>k.frame===at())?.easing??'linear'}].sort((x,y)=>x.frame-y.frame)});
 const volume=number(filmText('音量 dB'),20*Math.log10(Math.max(.001,a.gain??1)),db=>keys.length?put(10**(db/20)):patch({gain:10**(db/20)}),'.1',-60,12);
 const tools=document.createElement('div');tools.className='film-actions';root.append(tools);
 const button=(name:string,text:string,action:()=>void)=>{const b=document.createElement('button');b.textContent=text;b.title=name;b.setAttribute('aria-label',name);b.disabled=o.locked;b.onclick=action;tools.append(b);return b;};
 button(filmText('添加音量关键帧'),'◆',()=>put(clipGain({...clip,audio:{...a,fadeIn:0,fadeOut:0}},o.position()-clip.at)));
 const remove=button(filmText('删除音量关键帧'),'◇',()=>patch({keys:keys.length>1?keys.filter(k=>k.frame!==at()):undefined}));
 const ease=document.createElement('select');ease.append(...Object.keys(curves).map(k=>new Option(easingLabel(k),k)));ease.onchange=()=>patch({keys:keys.map(k=>k.frame===at()?{...k,easing:curves[ease.value]}:k)});label(filmText('音量缓动'),ease);
 const mute=document.createElement('input');mute.type='checkbox';mute.checked=!!a.muted;mute.disabled=o.locked;mute.onchange=()=>patch({muted:mute.checked});label(filmText('片段静音'),mute);
 for(const [key,name] of [['fadeIn','声音淡入（秒）'],['fadeOut','声音淡出（秒）']] as const)number(name,frameSeconds(a[key]??0,o.doc.frameRate),seconds=>patch({[key]:secondsFrame(seconds,o.doc.frameRate)}),'.05',0);
 const duck=a.duck??{enabled:false,amountDb:-18,attack:secondsFrame(.2,o.doc.frameRate),release:secondsFrame(.5,o.doc.frameRate)};
 if(a.role==='music'){
  const enabled=document.createElement('input');enabled.type='checkbox';enabled.checked=duck.enabled;enabled.disabled=o.locked;enabled.onchange=()=>patch({duck:{...duck,enabled:enabled.checked}});label(filmText('旁白时自动压低'),enabled);
  number(filmText('压低量 dB'),duck.amountDb,value=>patch({duck:{...duck,amountDb:value}}),'1',-60,0);
  for(const [key,name] of [['attack','压低提前（秒）'],['release','恢复时长（秒）']] as const)number(name,frameSeconds(duck[key],o.doc.frameRate),seconds=>patch({duck:{...duck,[key]:secondsFrame(seconds,o.doc.frameRate)}}),'.05',0);
 }
 const align=(words=o.source.words)=>{if(!words)return;const id=crypto.randomUUID(),track=wordSubtitles(o.doc,clip,words,{id,language:o.language()});track.wordSourceId=o.source.id;track.wordGroupSize=6;o.commands([{type:'film.words.set',sourceId:o.source.id,words},{type:'film.track.add',track}]);};
 button(filmText('导入 TTS 逐词时间'),filmText('逐词 JSON'),()=>o.pick('.json',text=>align(parseWordTimings(JSON.parse(text)))));
 if(o.source.words?.length)button(filmText('从逐词时间生成字幕'),filmText('对齐字幕'),()=>align());
 root.append(loudnessControls(o.doc,clip,o.locked,o.commands,o.report??(()=>{})));
 const list=document.createElement('div');list.className='film-key-list';for(const key of keys){const b=document.createElement('button');b.textContent=`${key.frame-(clip.animationOffset??0)} 帧 · ${(20*Math.log10(Math.max(.001,key.value))).toFixed(1)} dB`;b.onclick=()=>o.seek(clip.at+key.frame-(clip.animationOffset??0));list.append(b);}root.append(list);
 const effects=a.effects??{},eq=effects.eq??[{type:'lowshelf' as const,frequency:120,gain:0,q:.7},{type:'peaking' as const,frequency:1000,gain:0,q:1},{type:'highshelf' as const,frequency:8000,gain:0,q:.7}];
 const effect=(change:Partial<typeof effects>)=>patch({effects:{...effects,...change}});
 const bypass=document.createElement('input');bypass.type='checkbox';bypass.checked=effects.enabled!==false;bypass.disabled=o.locked;bypass.onchange=()=>effect({enabled:bypass.checked});label(filmText('启用 EQ 与压缩'),bypass);
 for(const [i,band] of eq.entries()){const name=filmText(['低频','中频','高频'][i]??'频段')+(i>2?' '+(i+1):'');const update=(change:Partial<typeof band>)=>effect({eq:eq.map((b,j)=>i===j?{...b,...change}:b)});number(name+' '+filmText('频率 Hz'),band.frequency,v=>update({frequency:v}),'10',10,24000);number(name+' '+filmText('增益 dB'),band.gain,v=>update({gain:v}),'.5',-40,40);if(band.type==='peaking')number(name+' Q',band.q,v=>update({q:v}),'.1',.001,100);}
 const compressor=effects.compressor??{threshold:-24,knee:30,ratio:4,attack:.003,release:.25};
 const compress=document.createElement('input');compress.type='checkbox';compress.checked=!!effects.compressor;compress.disabled=o.locked;compress.onchange=()=>effect({compressor:compress.checked?compressor:undefined});label(filmText('动态压缩'),compress);
 if(effects.compressor)for(const [key,name,step,min,max] of [['threshold','压缩阈值 dB','1',-100,0],['knee','压缩拐点 dB','1',0,40],['ratio','压缩比','.5',1,20],['attack','压缩启动（秒）','.001',0,1],['release','压缩释放（秒）','.01',0,1]] as const)number(name,compressor[key],v=>effect({compressor:{...compressor,[key]:v}}),step,min,max);
 const advanced=inspectorSection(filmText('声音处理'),'audio-processing');
 const basic=['音量 dB','声音淡入（秒）','声音淡出（秒）','片段静音'].map(name=>root.querySelector(`[aria-label="${filmText(name)}"]`)?.closest('label')).filter((row):row is HTMLLabelElement=>!!row);
 for(const child of [...root.children])if(!basic.includes(child as HTMLLabelElement))advanced.append(child);
 const volumeRow=volume.closest('label')!,keyRow=document.createElement('div');keyRow.className='film-audio-key-row';keyRow.append(volumeRow,...[...tools.children].slice(0,2));root.prepend(keyRow);root.append(advanced);
 function refresh(){const key=keys.find(k=>k.frame===at());remove.disabled=o.locked||!key;ease.disabled=o.locked||!key;if(document.activeElement!==ease)ease.value=Object.keys(curves).find(k=>JSON.stringify(curves[k])===JSON.stringify(key?.easing??'linear'))??'linear';if(document.activeElement!==volume)volume.value=(20*Math.log10(Math.max(.001,clipGain({...clip,audio:{...a,fadeIn:0,fadeOut:0}},o.position()-clip.at)))).toFixed(1);}
 refresh();return {node:root,refresh};
}
