import {type FilmClip,type FilmCommand,type FilmProperty,clipAppearance} from '@notale/editor/film';
export type ClipGeometry={x:number;y:number;rotation:number;skewX:number;scaleX:number;scaleY:number};
export type ClipGroupChange={dx:number;dy:number;scale:number;rotate:number};
export function clipGeometryCorners(base:ClipGeometry,width:number,height:number){
 const angle=base.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),skew=Math.tan(base.skewX*Math.PI/180);
 return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([xx,yy])=>{const x=xx*width/2*base.scaleX+skew*yy*height/2*base.scaleY,y=yy*height/2*base.scaleY;return{x:base.x+c*x-s*y,y:base.y+s*x+c*y};});
}
/** A common uniform transform preserves each clip's skew, reflections and keys. */
export function transformClipGroup(base:ClipGeometry,center:{x:number;y:number},change:ClipGroupChange):ClipGeometry{
 if(![center.x,center.y,change.dx,change.dy,change.scale,change.rotate].every(Number.isFinite)||change.scale<=0)throw Error('片段组合变换无效');
 const angle=change.rotate*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),x=(base.x-center.x)*change.scale,y=(base.y-center.y)*change.scale;
 return{...base,x:center.x+c*x-s*y+change.dx,y:center.y+s*x+c*y+change.dy,scaleX:base.scaleX*change.scale,scaleY:base.scaleY*change.scale,rotation:base.rotation+change.rotate};
}
/** R * skewX * scale, preserving reflections and the closest authored turn. */
export function decomposeClipMatrix(matrix:readonly number[],left:number,top:number,width:number,height:number,base:ClipGeometry):ClipGeometry {
 const [a,b,c,d,e,f]=matrix,sign=base.scaleX<0?-1:1,sx=Math.hypot(a,b)*sign,det=a*d-b*c;
 if(!matrix.every(Number.isFinite)||Math.abs(sx)<1e-9||Math.abs(det)<1e-12)throw Error('缩放为零时请先在属性面板恢复尺寸');
 const sy=det/sx,angle=Math.atan2(b/sign,a/sign)*180/Math.PI;
 return {x:left+width/2+e,y:top+height/2+f,rotation:angle+360*Math.round((base.rotation-angle)/360),skewX:Math.atan((a*c+b*d)/det)*180/Math.PI,scaleX:sx,scaleY:sy};
}
/** Only changed properties are authored. Existing curves receive a key at the
 * displayed frame, including a split clip's authored clock offset. */
export function clipGeometryCommands(clip:FilmClip,at:number,before:ClipGeometry,after:ClipGeometry):FilmCommand[]{
 const frame=at-clip.at+(clip.animationOffset??0),commands:FilmCommand[]=[];
 for(const property of Object.keys(after) as (keyof ClipGeometry)[]){
  if(Math.abs(after[property]-before[property])<1e-6)continue;
  const keys=clip.appearance?.keyframes?.[property];
  commands.push(keys?.length?{type:'film.keyframe.put',clipId:clip.id,property,keyframe:{frame,value:after[property],easing:keys.find(k=>k.frame===frame)?.easing??'linear'}}:{type:'film.property.set',clipId:clip.id,property,value:after[property]});
 }
 return commands;
}
export function sampledClipGeometry(clip:FilmClip,at:number,width:number,height:number){
 const appearance=clipAppearance(clip,at-clip.at),value=(key:FilmProperty,fallback:number)=>typeof appearance[key]==='number'?appearance[key] as number:fallback;
 return {x:value('x',width/2),y:value('y',height/2),rotation:value('rotation',0),skewX:value('skewX',0),scaleX:value('scaleX',1),scaleY:value('scaleY',1)};
}
