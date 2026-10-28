/** All geometry is already mapped into the same stage coordinate system. */
export interface OcclusionPoint {x:number;y:number}
export type OcclusionShape=readonly OcclusionPoint[]|{x:number;y:number;width:number;height:number};
export interface OcclusionLayer {
 clipId:string;title:string;shapes?:readonly OcclusionShape[];opacity?:number;
 hidden?:boolean;active?:boolean;uncertain?:boolean;unknown?:string;
}
export interface OcclusionTarget {
 clipId:string;title?:string;actId:string;
 /** [] means there are no active regions; omitted means they are not known. */
 regions?:readonly {key:string;label?:string;shape:OcclusionShape;uncertain?:boolean}[];
 unknown?:string;
}
export interface OcclusionWarning {
 clipId:string;targetClipId:string;actId:string;regionKey:string;regionLabel:string;
 coverTitle:string;targetTitle:string;uncertain:boolean;
}
export interface OcclusionUnknown {clipId?:string;targetClipId:string;actId:string;regionKey?:string;reason:string}
export interface OcclusionResult {warnings:OcclusionWarning[];unknown:OcclusionUnknown[]}

const epsilon=1e-9;
const cross=(a:OcclusionPoint,b:OcclusionPoint,p:OcclusionPoint)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
function signedArea(points:readonly OcclusionPoint[]){
 let twice=0;for(let i=1;i+1<points.length;i++)twice+=cross(points[0],points[i],points[i+1]);return twice/2;
}
/** undefined is invalid/unsupported geometry; [] is a valid empty footprint. */
function polygon(input:readonly OcclusionPoint[]):OcclusionPoint[]|undefined{
 if(input.length>64||input.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return;
 const points=input.filter((p,i)=>!i||p.x!==input[i-1].x||p.y!==input[i-1].y).map(p=>({...p}));
 if(points.length>1&&points[0].x===points.at(-1)!.x&&points[0].y===points.at(-1)!.y)points.pop();
 if(points.length<3)return [];
 const area=signedArea(points);
 // Collinear/collapsed transforms are empty. A self-crossing polygon is unknown.
 if(Math.abs(area)<=epsilon)return points.every(p=>Math.abs(cross(points[0],points[1],p))<=epsilon)?[]:undefined;
 const direction=Math.sign(area);
 for(let i=0;i<points.length;i++)if(points.some(p=>direction*cross(points[i],points[(i+1)%points.length],p)<-epsilon))return;
 return points;
}
function shapePolygon(shape:OcclusionShape):OcclusionPoint[]|undefined{
 if(Array.isArray(shape))return polygon(shape);
 const {x,y,width,height}=shape as Exclude<OcclusionShape,readonly OcclusionPoint[]>;
 if(![x,y,width,height].every(Number.isFinite)||width<0||height<0)return;
 return polygon([{x,y},{x:x+width,y},{x:x+width,y:y+height},{x,y:y+height}]);
}
function intersect(subject:readonly OcclusionPoint[],clip:readonly OcclusionPoint[]):OcclusionPoint[]{
 if(!subject.length||!clip.length)return [];
 let output=subject.map(p=>({...p}));const direction=Math.sign(signedArea(clip));
 for(let i=0;i<clip.length&&output.length;i++){
  const a=clip[i],b=clip[(i+1)%clip.length],input=output;output=[];
  let previous=input.at(-1)!,before=direction*cross(a,b,previous);
  for(const point of input){
   const after=direction*cross(a,b,point),inside=after>=-epsilon,wasInside=before>=-epsilon;
   if(inside!==wasInside){const t=before/(before-after);output.push({x:previous.x+(point.x-previous.x)*t,y:previous.y+(point.y-previous.y)*t});}
   if(inside)output.push({...point});previous=point;before=after;
  }
 }
 return Math.abs(signedArea(output))<=epsilon?[]:output;
}
/** Convex polygon intersection, accepting either winding. Invalid polygons return
 * undefined, so callers can preserve an unknown state instead of declaring clear. */
export function clipOcclusionPolygon(subject:readonly OcclusionPoint[],clip:readonly OcclusionPoint[]):OcclusionPoint[]|undefined{
 const a=polygon(subject),b=polygon(clip);return a&&b?intersect(a,b):undefined;
}

/** layers are ordered top to bottom. This checks geometric overlap, not pixel
 * alpha or pointer capture: approximate footprints must be marked uncertain.
 * A result is clear only when BOTH warnings and unknown are empty. */
export function motaleOcclusion(input:{layers:readonly OcclusionLayer[];targets:readonly OcclusionTarget[];minimumArea?:number}):OcclusionResult{
 const minimumArea=input.minimumArea??1;if(!Number.isFinite(minimumArea)||minimumArea<0)throw Error('Invalid occlusion area threshold');
 const layers=input.layers.filter(layer=>!layer.hidden&&layer.active!==false&&!(Number.isFinite(layer.opacity)&&layer.opacity!<=0));
 const warnings=new Map<string,OcclusionWarning>(),unknown=new Map<string,OcclusionUnknown>();
 const addUnknown=(item:OcclusionUnknown)=>unknown.set(JSON.stringify([item.clipId,item.targetClipId,item.actId,item.regionKey,item.reason]),item);
 const shapes=new Map<OcclusionLayer,(OcclusionPoint[]|undefined)[]>();
 for(const layer of layers)if(layer.shapes)shapes.set(layer,layer.shapes.map(shapePolygon));
 for(const target of input.targets){
  const index=layers.findIndex(layer=>layer.clipId===target.clipId);if(index<0)continue;
  const owner=layers[index],base={targetClipId:target.clipId,actId:target.actId};
  if(target.unknown)addUnknown({...base,reason:target.unknown});
  if(owner.unknown||owner.uncertain)addUnknown({...base,clipId:owner.clipId,reason:owner.unknown??'交互图层几何不确定'});
  if(owner.opacity!==undefined&&!Number.isFinite(owner.opacity))addUnknown({...base,clipId:owner.clipId,reason:'图层透明度无效'});
  if(!target.regions){if(!target.unknown)addUnknown({...base,reason:'交互区域尚未就绪'});continue;}
  const regions=target.regions.flatMap(region=>{
   const points=shapePolygon(region.shape);
   if(!points){addUnknown({...base,regionKey:region.key,reason:'交互区域几何无效'});return [];}
   if(region.uncertain)addUnknown({...base,regionKey:region.key,reason:'交互区域几何不确定'});
   return points.length?[{...region,points}]:[];
  });
  if(!regions.length)continue;
  for(const cover of layers.slice(0,index)){
   if(cover.clipId===target.clipId)continue;
   const footprints=shapes.get(cover),invalid=footprints?.some(points=>points===undefined),badOpacity=cover.opacity!==undefined&&!Number.isFinite(cover.opacity);
   const reason=cover.unknown??(cover.uncertain?'遮挡图层几何不确定':badOpacity?'图层透明度无效':!footprints?'图层几何尚未就绪':invalid?'图层几何无效':undefined);
   if(reason)addUnknown({...base,clipId:cover.clipId,reason});
   for(const region of regions){
    if(!footprints?.some(points=>points&&Math.abs(signedArea(intersect(points,region.points)))>minimumArea))continue;
    const key=JSON.stringify([cover.clipId,target.clipId,target.actId,region.key]),previous=warnings.get(key);
    warnings.set(key,{clipId:cover.clipId,...base,regionKey:region.key,regionLabel:region.label??region.key,coverTitle:cover.title,targetTitle:target.title??owner.title,
     uncertain:!!(previous?.uncertain||reason||target.unknown||owner.unknown||owner.uncertain||region.uncertain)});
   }
  }
 }
 return{warnings:[...warnings.values()],unknown:[...unknown.values()]};
}
