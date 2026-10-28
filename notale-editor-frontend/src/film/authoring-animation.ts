import type {FilmClip,FilmDocument,FilmCommand,FilmProperty,FilmPropertyValue} from '@notale/editor/film';
export const filmPresetEffects=['fade-in','fade-out','fly-in','fly-out','zoom-in','zoom-out','pulse','spin'] as const;
const effectProperties:Record<string,string>={'fade-in':'opacity','fade-out':'opacity','fly-in':'translate','fly-out':'translate','zoom-in':'scale','zoom-out':'scale',pulse:'scale',spin:'rotate'};
export function presetProperty(effect:string){return effectProperties[effect];}
function tuple(value:string|undefined,fallback:number,unit=''){
 if(!value||value==='none')return [fallback,fallback];
 const values=value.trim().split(/\s+/);if(values.length>2||values.some(value=>!new RegExp(`^[-+]?(?:\\d*\\.)?\\d+${unit}$`).test(value)))throw Error('当前变换无法转换为二维关键帧');
 const result=values.map(parseFloat);return [result[0],result[1]??(unit?'0':result[0])].map(Number);
}
/** Presets own no identity: their durable result is ordinary property keys. */
export function objectPreset(doc:FilmDocument,clip:FilmClip,position:number,ids:string[],styles:Record<string,Record<string,string>>,effect:string):FilmCommand[]{
 const property=presetProperty(effect);if(!property)throw Error('当前对象不支持此效果');
 const span=Math.min(Math.max(1,Math.round(.6*doc.frameRate.numerator/doc.frameRate.denominator)),clip.duration-1),out=effect.endsWith('-out'),emphasis=effect==='pulse'||effect==='spin';
 const start=out?clip.duration-1-span:emphasis?Math.max(0,position-clip.at):0,end=Math.min(clip.duration-1,start+span);
 if(end<=start||effect==='pulse'&&end-start<2)throw Error('片段剩余时间不足，请延长片段');
 const frame=(at:number)=>at+(clip.animationOffset??0),result:FilmCommand[]=[];
 for(const target of ids){
  if(clip.objects?.[target]?.keyframes?.[property]?.length)throw Error('该属性已有关键帧，请在时间线编辑；预设不会覆盖原动画');
  const css=styles[target]??{};let values:string[];
  if(property==='opacity'){const base=Number(css.opacity||1);if(!Number.isFinite(base))throw Error('无法读取不透明度');values=out?[String(base),'0']:['0',String(base)];}
  else if(property==='translate'){const [x,y]=tuple(css.translate,0,'px');const base=`${x}px ${y}px`;values=out?[base,`${x+120}px ${y}px`]:[`${x-120}px ${y}px`,base];}
  else if(property==='scale'){const [x,y]=tuple(css.scale,1),base=`${x} ${y}`;values=effect==='pulse'?[base,`${x*1.08} ${y*1.08}`,base]:out?[base,`${x*.85} ${y*.85}`]:[`${x*.85} ${y*.85}`,base];}
  else {const raw=css.rotate||'none';if(raw!=='none'&&!/^[-+]?(?:\d*\.)?\d+deg$/.test(raw))throw Error('当前旋转不是二维角度');const base=raw==='none'?0:parseFloat(raw);values=[`${base}deg`,`${base+360}deg`];}
  values.forEach((value,index)=>result.push({type:'film.object.key.put',clipId:clip.id,target,property,keyframe:{frame:frame(index===0?start:index===values.length-1?end:start+Math.floor((end-start)/2)),value,easing:[.42,0,.58,1]}}));
 }return result;
}
export function clipStyleCommand(clip:FilmClip,position:number,property:FilmProperty,value:FilmPropertyValue):FilmCommand{
 const keys=clip.appearance?.keyframes?.[property],frame=position-clip.at+(clip.animationOffset??0);
 return keys?.length?{type:'film.keyframe.put',clipId:clip.id,property,keyframe:{frame,value,easing:keys.find(key=>key.frame===frame)?.easing??'linear'}}:{type:'film.property.set',clipId:clip.id,property,value};
}
export function clipPreset(doc:FilmDocument,clip:FilmClip,position:number,values:Partial<Record<FilmProperty,FilmPropertyValue>>,effect:string):FilmCommand[]{
 const property=presetProperty(effect),properties=property==='translate'?['x','y']:property==='scale'?['scaleX','scaleY']:[property==='rotate'?'rotation':property];
 if(properties.some(name=>clip.appearance?.keyframes?.[name as FilmProperty]?.length))throw Error('该属性已有关键帧，请在时间线编辑；预设不会覆盖原动画');
 const target='film-clip',styles={[target]:{opacity:String(values.opacity??1),translate:`${values.x??doc.width/2}px ${values.y??doc.height/2}px`,scale:`${values.scaleX??1} ${values.scaleY??1}`,rotate:`${values.rotation??0}deg`}};
 const generated=objectPreset(doc,{...clip,objects:{}},position,[target],styles,effect),result:FilmCommand[]=[];
 for(const command of generated)if(command.type==='film.object.key.put'){
  const tokens=command.keyframe.value.split(/\s+/).map(parseFloat);
  properties.forEach((property,index)=>result.push({type:'film.keyframe.put',clipId:clip.id,property:property as FilmProperty,keyframe:{...command.keyframe,value:tokens[index]}}));
 }return result;
}
