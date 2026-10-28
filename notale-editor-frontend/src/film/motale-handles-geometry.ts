import type {FilmMotaleAuthor} from '@notale/editor/film';
import type {MotaleBridgeObject,MotaleBox} from './motale-bridge.js';
import {sampleMotaleValue,writeMotaleValue} from './motale-keyframes.js';

export type MotalePoint={x:number;y:number};
export type MotaleAffine={a:number;b:number;c:number;d:number;e:number;f:number};
export function transformMotalePoint(m:MotaleAffine,p:MotalePoint):MotalePoint{return{x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f};}
export function inverseMotalePoint(m:MotaleAffine,p:MotalePoint):MotalePoint{const det=m.a*m.d-m.b*m.c;if(!Number.isFinite(det)||Math.abs(det)<1e-10)throw Error('场景变换不可编辑');const x=p.x-m.e,y=p.y-m.f;return{x:(m.d*x-m.c*y)/det,y:(m.a*y-m.b*x)/det};}
export function motaleSelectionRoots(objects:MotaleBridgeObject[],ids:readonly string[]){
 const byId=new Map(objects.map(object=>[object.id,object])),selected=new Set(ids);
 return objects.filter(object=>selected.has(object.id)&&object.editable&&object.visible&&object.bounds).filter(object=>{
  let parent=object.parent;const seen=new Set([object.id]);
  while(parent){if(seen.has(parent))throw Error('场景对象层级无效');seen.add(parent);if(selected.has(parent)&&byId.get(parent)?.editable)return false;parent=byId.get(parent)?.parent??null;}return true;
 });
}
export function motaleSelectionBounds(objects:MotaleBridgeObject[]):MotaleBox|undefined{
 if(!objects.length)return;const bounds=objects.map(object=>object.bounds).filter((box):box is MotaleBox=>!!box&&box.every(Number.isFinite));if(bounds.length!==objects.length)return;
 return[Math.min(...bounds.map(b=>b[0])),Math.min(...bounds.map(b=>b[1])),Math.max(...bounds.map(b=>b[2])),Math.max(...bounds.map(b=>b[3]))];
}
/** Single objects turn about the protocol pivot; multiple roots share the
 * visible selection center. v0 has no public pivot and retains its AABB path. */
export function motaleSelectionPivot(objects:MotaleBridgeObject[]):MotalePoint|undefined{
 if(objects.length===1&&objects[0].pivot?.every(Number.isFinite))return{x:objects[0].pivot[0],y:objects[0].pivot[1]};
 const box=motaleSelectionBounds(objects);return box?{x:(box[0]+box[2])/2,y:(box[1]+box[3])/2}:undefined;
}
export type MotaleGroupTransform={dx:number;dy:number;scale:number;rotate:number};
/** Source-stage px; clockwise degrees, with scale/rotation around the shared center. */
export function transformMotaleSelection(author:FilmMotaleAuthor,actId:string,time:number,objects:MotaleBridgeObject[],ids:readonly string[],change:MotaleGroupTransform,baseObjects:MotaleBridgeObject[]):FilmMotaleAuthor{
 const roots=motaleSelectionRoots(objects,ids),box=motaleSelectionBounds(roots);if(!box)throw Error('所选对象没有可编辑边界');
 if(!Object.values(change).every(Number.isFinite)||change.scale<=0)throw Error('场景变换无效');
 const next=structuredClone(author),act=next.acts[actId]??={},values=act.objects??={},byId=new Map(objects.map(object=>[object.id,object])),bases=new Map(baseObjects.map(object=>[object.id,object]));
 if(author.schema!=='motale-author/0'){
  const center=motaleSelectionPivot(roots)!,angle=change.rotate*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
  for(const object of roots){
   const pivot=object.pivot;if(!pivot?.every(Number.isFinite)||!object.matrix?.every(Number.isFinite))throw Error('场景对象没有有效的变换矩阵或轴心');
   const parent=object.parent?byId.get(object.parent):undefined,matrix=parent?.matrix;
   if(object.parent&&(!matrix||matrix.length!==6||!matrix.every(Number.isFinite)))throw Error('场景父级变换矩阵不可用');
   const [a,b,c,d]=matrix??[1,0,0,1,0,0],px=(pivot[0]-center.x)*change.scale,py=(pivot[1]-center.y)*change.scale;
   const delta=inverseMotalePoint({a,b,c,d,e:0,f:0},{x:center.x+px*cos-py*sin+change.dx-pivot[0],y:center.y+px*sin+py*cos+change.dy-pivot[1]});
   const props=values[object.id]??={};
   const put=(property:'x'|'y'|'scale'|'rotate',value:number)=>{const spec=object.props[property];if(!spec)throw Error(`场景对象不支持 ${property}`);writeMotaleValue(props,property,value,time,spec);};
   const current=(property:'x'|'y'|'scale'|'rotate',fallback:number)=>Number(object.props[property]?.value??sampleMotaleValue(props[property],fallback,time));
   if(Math.abs(delta.x)>1e-9)put('x',current('x',0)+delta.x);
   if(Math.abs(delta.y)>1e-9)put('y',current('y',0)+delta.y);
   if(Math.abs(change.scale-1)>1e-9)put('scale',current('scale',1)*change.scale);
   if(Math.abs(change.rotate)>1e-9)put('rotate',current('rotate',0)+change.rotate);
  }
  return next;
 }
 // The v0 bridge applies author records in insertion order. Public AABBs do
 // not expose the full pivot chain of authored ancestor/descendant transforms.
 for(const object of roots){let parent=object.parent;while(parent){const props=values[parent];if(props&&(Number(sampleMotaleValue(props.scale,1,time))!==1||Number(sampleMotaleValue(props.rotate,0,time))!==0))throw Error('父级对象已有变换，请选择父级后调整');parent=byId.get(parent)?.parent??null;}
  if(change.scale!==1||change.rotate!==0)for(const descendant of objects){let ancestor=descendant.parent;while(ancestor&&ancestor!==object.id)ancestor=byId.get(ancestor)?.parent??null;if(ancestor===object.id&&values[descendant.id]&&['x','y','scale','rotate'].some(key=>key in values[descendant.id]))throw Error('所选组包含独立变换，请分别选择子对象调整');}
 }
 const center={x:(box[0]+box[2])/2,y:(box[1]+box[3])/2},angle=change.rotate*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
 for(const object of roots){const b=bases.get(object.id)?.bounds;if(!b)throw Error('所选对象没有可编辑边界');const props=values[object.id]??={};let x=(b[0]+b[2])/2+Number(sampleMotaleValue(props.x,0,time)),y=(b[1]+b[3])/2+Number(sampleMotaleValue(props.y,0,time)),parent=object.parent;
  while(parent){x+=Number(sampleMotaleValue(values[parent]?.x,0,time));y+=Number(sampleMotaleValue(values[parent]?.y,0,time));parent=byId.get(parent)?.parent??null;}
  const px=(x-center.x)*change.scale,py=(y-center.y)*change.scale,dx=center.x+px*cos-py*sin+change.dx-x,dy=center.y+px*sin+py*cos+change.dy-y;
  if(Math.abs(dx)>1e-9)writeMotaleValue(props,'x',Number(sampleMotaleValue(props.x,0,time))+dx,time);
  if(Math.abs(dy)>1e-9)writeMotaleValue(props,'y',Number(sampleMotaleValue(props.y,0,time))+dy,time);
  if(Math.abs(change.scale-1)>1e-9){const scale=Number(sampleMotaleValue(props.scale,1,time))*change.scale;if(scale<.01)throw Error('对象缩放不能小于 0.01');writeMotaleValue(props,'scale',scale,time);}
  if(Math.abs(change.rotate)>1e-9)writeMotaleValue(props,'rotate',Number(sampleMotaleValue(props.rotate,0,time))+change.rotate,time);
 }
 return next;
}
