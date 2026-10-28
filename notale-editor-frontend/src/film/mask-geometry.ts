import {clipAppearance,type FilmClip,type FilmMask,type FilmCommand,type FilmMaskSample} from '@notale/editor/film';
import {decomposeClipMatrix} from './clip-geometry.js';
export type Matrix=readonly [number,number,number,number,number,number];
export type MaskGeometry={x:number;y:number;width:number;height:number;rotation:number;skewX:number};
export function multiply(a:Matrix,b:Matrix):Matrix{return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
export function inverse(m:Matrix):Matrix{
 const [a,b,c,d,e,f]=m,det=a*d-b*c;if(Math.abs(det)<1e-12)throw Error('片段缩放为零，请先恢复片段尺寸');
 return [d/det,-b/det,-c/det,a/det,(c*f-d*e)/det,(b*e-a*f)/det];
}
function transform(rotation:number,skew:number,sx:number,sy:number,x:number,y:number):Matrix{
 const r=rotation*Math.PI/180,k=Math.tan(skew*Math.PI/180),c=Math.cos(r),s=Math.sin(r);return [c*sx,s*sx,(c*k-s)*sy,(s*k+c)*sy,x,y];
}
/** Maps source-centered coordinates to the film stage, including reflected clips. */
export function clipWorldMatrix(clip:FilmClip,at:number,stage:{width:number;height:number},size:{width:number;height:number}):Matrix{
 const a=clipAppearance(clip,at-clip.at),n=(key:keyof typeof a,fallback:number)=>Number(a[key]??fallback);
 return transform(n('rotation',0),n('skewX',0),n('scaleX',1)*n('width',size.width)/size.width,n('scaleY',1)*n('height',size.height)/size.height,n('x',stage.width/2),n('y',stage.height/2));
}
export function maskProxy(sample:FilmMaskSample,size:{width:number;height:number},world:Matrix){
 const v=sample.values,base:MaskGeometry={x:Number(v.x),y:Number(v.y),width:Number(v.width),height:Number(v.height),rotation:Number(v.rotation),skewX:Number(v.skewX)};
 const width=Math.max(1,['linear','mirror'].includes(String(v.shape))?size.width:base.width*size.width/100),height=Math.max(1,v.shape==='linear'?size.height/3:base.height*size.height/100);
 const local=transform(base.rotation,base.skewX,1,1,(base.x/100-.5)*size.width,(base.y/100-.5)*size.height);
 return {width,height,base,matrix:multiply(world,local)};
}
export function maskFromProxy(matrix:Matrix,world:Matrix,proxy:{width:number;height:number;base:MaskGeometry},size:{width:number;height:number},shape:string):MaskGeometry{
 const local=multiply(inverse(world),matrix),g=decomposeClipMatrix(local,-proxy.width/2,-proxy.height/2,proxy.width,proxy.height,{...proxy.base,scaleX:1,scaleY:1});
 if(g.scaleX<=0||g.scaleY<=0)throw Error('遮罩尺寸不能反向；请使用旋转或反向遮罩');
 return {...proxy.base,x:(g.x/size.width+.5)*100,y:(g.y/size.height+.5)*100,width:['linear','mirror'].includes(shape)?proxy.base.width:g.scaleX*proxy.width/size.width*100,height:shape==='linear'?proxy.base.height:g.scaleY*proxy.height/size.height*100,rotation:g.rotation,skewX:g.skewX};
}
export function maskGeometryCommands(clip:FilmClip,mask:FilmMask,at:number,before:MaskGeometry,after:MaskGeometry):FilmCommand[]{
 const frame=at-clip.at+(clip.animationOffset??0),commands:FilmCommand[]=[];
 for(const property of Object.keys(after) as (keyof MaskGeometry)[]){if(Math.abs(after[property]-before[property])<1e-6)continue;const keys=mask.keyframes?.[property];commands.push(keys?.length?{type:'film.mask.key.put',clipId:clip.id,maskId:mask.id,property,keyframe:{frame,value:after[property],easing:keys.find(k=>k.frame===frame)?.easing??'linear'}}:{type:'film.mask.property',clipId:clip.id,maskId:mask.id,property,value:after[property]});}
 return commands;
}
