import type {FilmLayer,FilmSource} from '@notale/editor/film';
import type {MotaleBridgeSession} from './motale-bridge';
import type {OverlayPage} from './overlay-page';
import {clipOcclusionPolygon,motaleOcclusion,type OcclusionLayer,type OcclusionPoint,type OcclusionResult,type OcclusionTarget} from './motale-occlusion';

/** Structural view of a preview mount; this advisory reader owns no runtime. */
export interface OcclusionMount {
 node:HTMLElement;container:HTMLElement;source:FilmSource;width?:number;height?:number;
 appearance?:FilmLayer['appearance'];masks?:FilmLayer['masks'];transition?:FilmLayer['transition'];
 htmlStyle?:Record<string,string>;ready:boolean;error?:string;motale?:MotaleBridgeSession;overlay?:OverlayPage;dip?:HTMLElement;
}
type Polygon=OcclusionPoint[];
type Linear={a:number;b:number;c:number;d:number};
const quad=(x:number,y:number,w:number,h:number):Polygon=>w<=0||h<=0?[]:[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
const hidden=(node:HTMLElement,css:CSSStyleDeclaration)=>node.hidden||!node.isConnected||css.display==='none'||css.visibility==='hidden'||css.visibility==='collapse'||css.contentVisibility==='hidden';
function matrix(node:HTMLElement,width:number,height:number,parent:Linear={a:1,b:0,c:0,d:1}){
 const css=getComputedStyle(node),raw=new DOMMatrix(css.transform==='none'?undefined:css.transform),box=node.getBoundingClientRect();
 if(!raw.is2D||![raw.a,raw.b,raw.c,raw.d,width,height,box.x,box.y].every(Number.isFinite)||width<=0||height<=0)throw Error('图层变换无法精确判断');
 const a=parent.a*raw.a+parent.c*raw.b,b=parent.b*raw.a+parent.d*raw.b,c=parent.a*raw.c+parent.c*raw.d,d=parent.b*raw.c+parent.d*raw.d;
 return {a,b,c,d,map:({x,y}:OcclusionPoint):OcclusionPoint=>({x:box.x+box.width/2+a*(x-width/2)+c*(y-height/2),y:box.y+box.height/2+b*(x-width/2)+d*(y-height/2)})};
}
function clipped(subject:readonly OcclusionPoint[],clip:readonly OcclusionPoint[]){const result=clipOcclusionPolygon(subject,clip);if(!result)throw Error('图层裁切几何无法判断');return result;}
/** The compositor uses inset(percent); resolved CSS px insets are supported too. */
function inset(value:string,width:number,height:number):Polygon|undefined{
 const match=/^inset\(([^()]*)\)$/.exec(value.trim());if(!match||/\bround\b/.test(match[1]))return;
 const parts=match[1].trim().split(/\s+/);if(!parts.length||parts.length>4)return;
 const expanded=[parts[0],parts[1]??parts[0],parts[2]??parts[0],parts[3]??parts[1]??parts[0]];
 const values=expanded.map((part,i)=>{const n=/^(-?(?:\d+(?:\.\d*)?|\.\d+))(px|%)?$/.exec(part);return n?Number(n[1])*(n[2]==='%'?(i%2?width:height)/100:1):NaN;});
 if(!values.every(Number.isFinite))return;const [top,right,bottom,left]=values;return quad(left,top,width-left-right,height-top-bottom);
}
function uncertainStyle(css:CSSStyleDeclaration,mount:OcclusionMount){
 if(mount.masks?.length||css.maskImage&&css.maskImage!=='none')return '复杂遮罩的可见范围尚不能精确判断';
 if(['borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius'].some(name=>parseFloat(css[name as keyof CSSStyleDeclaration] as string)>0))return '圆角边界尚不能精确判断';
 if(/(?:blur\((?!0(?:px)?\))|drop-shadow\(|url\()/.test(css.filter))return '滤镜的绘制范围尚不能精确判断';
 if(mount.htmlStyle&&Object.keys(mount.htmlStyle).length)return '自定义 CSS 的绘制范围尚不能精确判断';
 return undefined;
}

/** Host DOM geometry plus public bridge/paint measurements only. No iframe DOM,
 * hit regions, author writes or clock changes. Caption covers are already mapped
 * into client pixels and appear above all media layers. */
export function collectPreviewOcclusion(root:HTMLElement,stage:{width:number;height:number},layers:readonly FilmLayer[],mounts:ReadonlyMap<string,OcclusionMount>,captions:readonly OcclusionLayer[]=[]):OcclusionResult{
 const covers:OcclusionLayer[]=[...captions],targets:OcclusionTarget[]=[],targetIssues=new Map<string,string|undefined>(),aliases=new Map<string,string>();
 let rootClip:Polygon,stageClip:Polygon,rootLinear:Linear;
 try{
  const outer=matrix(root,root.offsetWidth,root.offsetHeight),scale=Math.min(root.clientWidth/stage.width,root.clientHeight/stage.height);
  if(!Number.isFinite(scale)||scale<=0)throw Error();rootLinear=outer;
  rootClip=quad(root.clientLeft,root.clientTop,root.clientWidth,root.clientHeight).map(outer.map);
  stageClip=clipped(quad(root.clientLeft+(root.clientWidth-stage.width*scale)/2,root.clientTop+(root.clientHeight-stage.height*scale)/2,stage.width*scale,stage.height*scale).map(outer.map),rootClip);
 }catch{return {warnings:[],unknown:layers.filter(layer=>layer.source.kind==='motale').map(layer=>({targetClipId:layer.clipId,actId:'',reason:'预览画面尚未就绪'}))};}
 for(const layer of layers){
  if(layer.source.kind==='audio')continue;
  const mount=mounts.get(layer.clipId),cover:OcclusionLayer={clipId:layer.clipId,title:layer.source.title};
  const target:OcclusionTarget|undefined=layer.source.kind==='motale'?{clipId:layer.clipId,title:layer.source.title,actId:''}:undefined;
  let targetIssue:string|undefined;
  try{
   if(!mount)throw Error('图层尚未就绪');
   const css=getComputedStyle(mount.node),containerCss=getComputedStyle(mount.container);
   if(hidden(mount.node,css)||hidden(mount.container,containerCss))continue;
   cover.opacity=Number(css.opacity)*Number(containerCss.opacity);
   // The dip is a sibling of the source node, so its opacity is independent.
   if(mount.dip){const dipCss=getComputedStyle(mount.dip),opacity=Number(dipCss.opacity)*Number(containerCss.opacity);if(!hidden(mount.dip,dipCss)&&opacity>0){const id=`${layer.clipId}\u0000dip`;aliases.set(id,layer.clipId);covers.push({clipId:id,title:layer.source.title+' · 转场',opacity,shapes:[stageClip]});}}
   if(cover.opacity<=0)continue;
   const width=mount.width??stage.width,height=mount.height??stage.height,transform=matrix(mount.node,width,height,rootLinear);
   let localClip=quad(0,0,width,height);targetIssue=uncertainStyle(css,mount);
   if(css.clipPath&&css.clipPath!=='none'){const crop=inset(css.clipPath,width,height);if(crop)localClip=clipped(localClip,crop);else targetIssue??='复杂裁切的可见范围尚不能精确判断';}
   let viewport=clipped(localClip.map(transform.map),stageClip);
   if(containerCss.clipPath&&containerCss.clipPath!=='none'){
    const w=mount.container.clientWidth,h=mount.container.clientHeight,crop=inset(containerCss.clipPath,w,h);
    if(crop){const map=matrix(mount.container,w,h,rootLinear);viewport=clipped(viewport,crop.map(map.map));}else targetIssue??='转场裁切范围尚不能精确判断';
   }
   const mapShape=(points:Polygon)=>clipped(points.map(transform.map),viewport);
   if(mount.error)throw Error(mount.error);if(!mount.ready)throw Error('图层尚未就绪');
   if(mount.overlay){
    const paint=mount.overlay.paintRegions;if(!paint.ready)throw Error('叠加层绘制范围尚未就绪');
    cover.shapes=paint.regions.filter(region=>region.opacity>0).map(region=>mapShape(quad(region.x,region.y,region.width,region.height)));
    cover.uncertain=paint.uncertain||paint.regions.some(region=>region.uncertain);if(cover.uncertain)cover.unknown='叠加层绘制范围包含不确定部分';
   }else{cover.shapes=[viewport];cover.uncertain=true;cover.unknown=layer.source.kind==='sequence'?'嵌套序列的绘制范围尚不能精确判断':'素材透明区域尚不能精确判断';}
   if(targetIssue){cover.unknown=targetIssue;cover.uncertain=true;}
   if(target){
    const context=mount.motale?.context();if(!context)throw Error('当前场景尚未提供编辑桥接');target.actId=context.act.id;
    if(context.error)throw Error(context.error);
    const windows=context.act.windows?context.bridge.windows(context.act.id):[],labels=new Map(windows.map(window=>[window.key,window.label??window.object??window.key]));
    const regions=context.bridge.regions(context.act.id,context.time,{parameters:'live'}),sw=context.hello.stage.width,sh=context.hello.stage.height;
    if(!(sw>0&&sh>0))throw Error('场景舞台尺寸无效');
    target.regions=regions.map(region=>{const [x0,y0,x1,y1]=region.bounds;return{key:region.key,label:labels.get(region.key)??region.key,shape:mapShape(quad(x0*width/sw,y0*height/sh,(x1-x0)*width/sw,(y1-y0)*height/sh))};});
    if(!regions.length&&!['manim','kit/mx'].includes(context.act.engine))targetIssue??='此引擎尚未提供可检测的观众交互区域';
    target.unknown=targetIssue;
   }
  }catch(error){const reason=error instanceof Error?error.message:'无法读取当前画面的遮挡信息';cover.unknown=reason;cover.uncertain=true;if(target){target.unknown=reason;targetIssue=reason;}}
  covers.push(cover);if(target){targets.push(target);targetIssues.set(target.clipId,targetIssue);}
 }
 const warnings=new Map<string,OcclusionResult['warnings'][number]>(),unknown=new Map<string,OcclusionResult['unknown'][number]>();
 for(const target of targets){
  // A Motale canvas is an approximate COVER, but its own public regions can be exact.
  const result=motaleOcclusion({layers:covers.map(cover=>cover.clipId===target.clipId?{...cover,uncertain:!!targetIssues.get(target.clipId),unknown:targetIssues.get(target.clipId)}:cover),targets:[target]});
  for(const warning of result.warnings){const value={...warning,clipId:aliases.get(warning.clipId)??warning.clipId};warnings.set(JSON.stringify([value.clipId,value.targetClipId,value.actId,value.regionKey]),value);}
  for(const item of result.unknown){const value={...item,clipId:item.clipId?(aliases.get(item.clipId)??item.clipId):undefined};unknown.set(JSON.stringify(value),value);}
 }
 return {warnings:[...warnings.values()],unknown:[...unknown.values()]};
}
