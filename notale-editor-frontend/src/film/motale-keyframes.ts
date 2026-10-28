import {clipSourceTime,type FilmClip,type FilmRate,type FilmMotaleObject,type FilmMotaleKeys,type FilmMotaleEasing} from '@notale/editor/film';
import type {MotalePropState} from './motale-bridge';
export type MotaleProperty='x'|'y'|'scale'|'rotate'|'opacity'|'color'|'visible'|'text'|'tex'|'value'|'values';
export type MotaleValue=number|string|boolean|null|number[];
type Properties=FilmMotaleObject&{text?:string;tex?:string;value?:number;values?:number[]};
export type MotaleKey=FilmMotaleKeys<number|string|boolean>['keys'][number];
export const motaleDefaults={x:0,y:0,scale:1,rotate:0,opacity:1,color:null,visible:true,text:'',tex:'',value:0,values:[]} satisfies Record<MotaleProperty,MotaleValue>;
export const motalePropertyLabels:Record<MotaleProperty,string>={x:'水平偏移',y:'垂直偏移',scale:'缩放',rotate:'旋转',opacity:'不透明度',color:'颜色',visible:'可见',text:'文字',tex:'公式',value:'数值',values:'数据'};
export const sameMotaleTime=(a:number,b:number)=>Math.abs(a-b)<1e-7;
export const isMotaleKeys=(value:unknown):value is FilmMotaleKeys<number|string|boolean>=>!!value&&typeof value==='object'&&'keys' in value&&Array.isArray(value.keys);
export function sampleMotaleValue(value:unknown,fallback:MotaleValue,time:number):MotaleValue{
 if(!isMotaleKeys(value))return value===undefined?fallback:value as MotaleValue;
 const keys=value.keys;if(!keys.length)return fallback;
 if(time<=keys[0][0])return keys[0][1];
 for(let i=1;i<keys.length;i++)if(time<keys[i][0]){const a=keys[i-1],b=keys[i];if(a[2]==='step'||typeof a[1]!=='number'||typeof b[1]!=='number')return a[1];let u=(time-a[0])/(b[0]-a[0]);if(a[2]==='smooth')u=u*u*(3-2*u);return a[1]+(b[1]-a[1])*u;}
 return keys.at(-1)![1];
}
function legacySpec(property:MotaleProperty):MotalePropState{return {type:property==='color'?'color':property==='visible'?'boolean':property==='text'?'string':property==='tex'?'tex':property==='values'?'numbers':'number',keyable:!['text','tex','value','values'].includes(property),base:motaleDefaults[property],value:motaleDefaults[property],...(property==='scale'?{min:.01}:property==='opacity'?{min:0,max:1}:{}),...(['text','tex'].includes(property)?{maxLength:2000}:{})};}
export function validateMotaleValue(property:MotaleProperty,value:MotaleValue,spec=legacySpec(property)){
 let valid=false;
 if(spec.type==='number')valid=typeof value==='number'&&Number.isFinite(value)&&(spec.min===undefined||value>=spec.min)&&(spec.max===undefined||value<=spec.max);
 else if(spec.type==='color')valid=value===null||typeof value==='string'&&/^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(value);
 else if(spec.type==='boolean')valid=typeof value==='boolean';
 else if(spec.type==='string'||spec.type==='tex')valid=typeof value==='string'&&(spec.maxLength===undefined||value.length<=spec.maxLength);
 else if(spec.type==='numbers')valid=Array.isArray(value)&&(spec.length===undefined||value.length===spec.length)&&value.every(v=>Number.isFinite(v)&&(spec.min===undefined||v>=spec.min)&&(spec.max===undefined||v<=spec.max));
 if(!valid)throw Error(spec.type==='color'?'请输入有效的十六进制颜色':spec.type==='numbers'?'数据长度或数值不符合对象要求':spec.type==='string'||spec.type==='tex'?'内容长度超出对象限制':'数值超出有效范围');
}
/** Only common, compatible capabilities are offered for a multi-selection. */
export function intersectMotaleProps(objects:readonly {props:Record<string,MotalePropState>}[]):{property:MotaleProperty;spec:MotalePropState}[]{
 if(!objects.length)return [];
 return (Object.keys(motaleDefaults) as MotaleProperty[]).flatMap(property=>{
  const specs=objects.map(object=>object.props[property]);if(specs.some(spec=>!spec)||specs.some(spec=>spec.type!==specs[0].type))return [];
  const first=specs[0];if(first.type==='numbers'&&specs.some(spec=>spec.length!==first.length))return [];
  const min=Math.max(...specs.map(spec=>spec.min??-Infinity)),max=Math.min(...specs.map(spec=>spec.max??Infinity)),maxLength=Math.min(...specs.map(spec=>spec.maxLength??Infinity));if(min>max)return [];
  return [{property,spec:{...first,keyable:specs.every(spec=>spec.keyable),min:Number.isFinite(min)?min:undefined,max:Number.isFinite(max)?max:undefined,maxLength:Number.isFinite(maxLength)?maxLength:undefined}}];
 });
}
function validTime(time:number){if(!Number.isFinite(time)||time<0)throw Error('关键帧时间必须为非负源秒');}
function keyable(spec:MotalePropState){if(!spec.keyable||!['number','color','boolean'].includes(spec.type))throw Error('此属性不支持关键帧');}
/** Mutates only the supplied draft; all other keys, content and objects remain unchanged. */
export function writeMotaleValue(props:Properties,property:MotaleProperty,value:MotaleValue,time:number,spec=legacySpec(property)){
 validateMotaleValue(property,value,spec);validTime(time);const old=props[property];
 if(isMotaleKeys(old)){keyable(spec);if(value===null||Array.isArray(value))throw Error('动画颜色不能留空，请先重置对象或填写颜色');const keys:MotaleKey[]=structuredClone(old.keys),key=keys.find(k=>sameMotaleTime(k[0],time));if(key)key[1]=value;else keys.push([time,value,typeof value==='number'?'linear':'step']);keys.sort((a,b)=>a[0]-b[0]);Reflect.set(props,property,{keys});}
 else Reflect.set(props,property,structuredClone(value));
}
export function addMotaleKey(props:Properties,property:MotaleProperty,time:number,spec=legacySpec(property)){
 validTime(time);keyable(spec);const old=props[property];if(isMotaleKeys(old)&&old.keys.some(k=>sameMotaleTime(k[0],time)))return;
 const value=sampleMotaleValue(old,spec.base as MotaleValue,time);validateMotaleValue(property,value,spec);if(value===null||Array.isArray(value))throw Error('请先设置颜色');const keys:MotaleKey[]=isMotaleKeys(old)?structuredClone(old.keys):[];keys.push([time,value,typeof value==='number'?'linear':'step']);keys.sort((a,b)=>a[0]-b[0]);Reflect.set(props,property,{keys});
}
/** Collision rejects instead of replacing an authored key. Last-key deletion retains its value. */
export function editMotaleKey(props:Properties,property:MotaleProperty,from:number,change:{time?:number;value?:MotaleValue;easing?:FilmMotaleEasing}|null,spec=legacySpec(property)){
 keyable(spec);const old=props[property];if(!isMotaleKeys(old))throw Error('关键帧已变化，请重新选择');const keys:MotaleKey[]=structuredClone(old.keys),index=keys.findIndex(k=>sameMotaleTime(k[0],from));if(index<0)throw Error('关键帧已变化，请重新选择');const key=keys[index];
 if(change===null){keys.splice(index,1);Reflect.set(props,property,keys.length?{keys}:key[1]);return;}
 if(change.time!==undefined){validTime(change.time);if(keys.some((k,i)=>i!==index&&sameMotaleTime(k[0],change.time!)))throw Error('该位置已有关键帧');key[0]=change.time;}
 if(change.value!==undefined){validateMotaleValue(property,change.value,spec);if(change.value===null||Array.isArray(change.value))throw Error('动画颜色不能留空，请先重置对象或填写颜色');key[1]=change.value;}
 if(change.easing!==undefined){if(!['linear','smooth','step'].includes(change.easing)||spec.type!=='number'&&change.easing!=='step')throw Error('颜色与可见性关键帧仅支持保持');key[2]=change.easing;}
 keys.sort((a,b)=>a[0]-b[0]);Reflect.set(props,property,{keys});
}
const bezier=(t:number,a:number,b:number)=>3*(1-t)*(1-t)*t*a+3*(1-t)*t*t*b+t*t*t;
function extrema(a:number,b:number){const A=3*(3*a-3*b+1),B=2*(-6*a+3*b),C=3*a;if(Math.abs(A)<1e-12)return Math.abs(B)<1e-12?[]:[-C/B].filter(t=>t>0&&t<1);const d=B*B-4*A*C;return d<0?[]:[(-B-Math.sqrt(d))/(2*A),(-B+Math.sqrt(d))/(2*A)].filter(t=>t>0&&t<1);}
/** Return every reachable local-frame solution. A held range contributes its nearest point to preferredLocalFrame.
 * Split Beziers at y extrema/clamp crossings so non-monotone easing and jumps never invent an inverse. */
export function motaleKeyFrames(clip:FilmClip,rate:FilmRate,sourceTime:number,preferredLocalFrame=0):number[]{
 if(!Number.isFinite(sourceTime)||clip.duration<=0)return [];
 const end=clip.duration,preferred=Math.max(0,Math.min(end-1,preferredLocalFrame)),map=clip.timing?.map;
 if(!map?.length){const speed=clip.timing?.rate??1;if(!speed)return sameMotaleTime(clip.in,sourceTime)?[preferred]:[];const frame=(sourceTime-clip.in)*rate.numerator/rate.denominator/speed;return frame>=-1e-7&&frame<end-1e-7?[Math.max(0,frame)]:[];}
 const offset=clip.animationOffset??0,knots=[0,end];
 for(let i=0;i<map.length;i++){
  knots.push(map[i].frame-offset);const a=map[i],b=map[i+1];if(!b||!Array.isArray(a.easing))continue;
  const [x1,y1,x2,y2]=a.easing,turns=[0,...extrema(y1,y2),1].sort((a,b)=>a-b),parts=[...turns];
  for(let j=1;j<turns.length;j++)for(const target of [0,1]){let l=turns[j-1],r=turns[j],left=bezier(l,y1,y2)-target,right=bezier(r,y1,y2)-target;if(left*right>=0)continue;for(let k=0;k<45;k++){const m=(l+r)/2,v=bezier(m,y1,y2)-target;if(left*v<=0){r=m;}else{l=m;left=v;}}parts.push((l+r)/2);}
  for(const t of parts)knots.push(a.frame+(b.frame-a.frame)*bezier(t,x1,x2)-offset);
 }
 const breaks=[...new Set(knots.filter(f=>f>=0&&f<=end))].sort((a,b)=>a-b),solutions:number[]=[],holds:{from:number;to:number}[]=[];
 const value=(frame:number)=>clipSourceTime(clip,frame,rate);
 const add=(frame:number)=>{if(frame>=0&&frame<end-1e-7&&Math.abs(value(frame)-sourceTime)<1e-6&&!solutions.some(f=>Math.abs(f-frame)<1e-5))solutions.push(frame);};
 for(const frame of breaks)add(frame);
 for(let i=1;i<breaks.length;i++){
  const from=breaks[i-1],to=breaks[i],pad=Math.min(1e-6,(to-from)*1e-6),l0=from+pad,r0=to-pad;if(r0<l0)continue;
  const a=value(l0),b=value(r0),mid=value((l0+r0)/2);
  if(Math.abs(a-b)<1e-7&&Math.abs(a-mid)<1e-7){if(sameMotaleTime(a,sourceTime))holds.push({from:sameMotaleTime(value(from),sourceTime)?from:l0,to:sameMotaleTime(value(to),sourceTime)?to:r0});continue;}
  if(sourceTime<Math.min(a,b)-1e-7||sourceTime>Math.max(a,b)+1e-7)continue;
  let l=l0,r=r0;for(let k=0;k<50;k++){const m=(l+r)/2;if((b>a)===(value(m)<sourceTime))l=m;else r=m;}add((l+r)/2);
 }
 const merged:{from:number;to:number}[]=[];for(const hold of holds){const last=merged.at(-1);if(last&&hold.from<=last.to+1e-7)last.to=Math.max(last.to,hold.to);else merged.push({...hold});}
 for(const hold of merged){for(let i=solutions.length-1;i>=0;i--)if(solutions[i]>=hold.from-1e-7&&solutions[i]<=hold.to+1e-7)solutions.splice(i,1);add(Math.max(hold.from,Math.min(hold.to,preferred)));}
 return solutions.sort((a,b)=>a-b);
}
