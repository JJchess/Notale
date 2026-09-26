export type ObjectRect={id:string;x:number;y:number;width:number;height:number;geometry?:unknown};
export function selectionBounds(rectangles:ObjectRect[]){
 if(!rectangles.length)return undefined;
 const x=Math.min(...rectangles.map(r=>r.x)),y=Math.min(...rectangles.map(r=>r.y));
 return {x,y,width:Math.max(...rectangles.map(r=>r.x+r.width))-x,height:Math.max(...rectangles.map(r=>r.y+r.height))-y};
}
export function geometryCommand(slideId:string,rectangles:ObjectRect[],field:string,value:number,proportional:boolean,rotation=0){
 const box=selectionBounds(rectangles);
 if(!box||rectangles.some(r=>!r.geometry))throw Error('所选对象暂不能调整几何位置');
 if(!Number.isFinite(value))throw Error('请输入有效数值');
 const base={type:'elements.arrange',slideId,rectangles};
 if(field==='tx'||field==='ty')return {...base,action:'translate',dx:field==='tx'?value-box.x:0,dy:field==='ty'?value-box.y:0};
 if(field==='rotation')return {...base,action:'rotate',angle:value-rotation};
 if(value<=0)throw Error('尺寸和缩放必须大于零');
 const ratio=field==='scale'?value:value/(field==='object-width'?box.width:box.height);
 if(!Number.isFinite(ratio)||ratio>100)throw Error('本次尺寸变化过大，请分次调整');
 return {...base,action:'scale',anchor:[box.x,box.y],factorX:field==='object-height'&&!proportional?1:ratio,factorY:field==='object-width'&&!proportional?1:ratio};
}
export function selectionUnits<T extends {id:string}>(items:T[],groups:{members:string[]}[]):T[][]{
 const remaining=new Set(items.map(r=>r.id)),units:T[][]=[];
 for(const item of items){
  if(!remaining.has(item.id))continue;
  const group=groups.find(g=>g.members.includes(item.id)&&g.members.every(id=>remaining.has(id)));
  const ids=group?.members??[item.id];
  units.push(items.filter(r=>ids.includes(r.id)));ids.forEach(id=>remaining.delete(id));
 }
 return units;
}
export function alignmentCommands(slideId:string,rectangles:ObjectRect[],groups:{members:string[]}[],action:string,reference:string,width:number,height:number){
 const units=selectionUnits(rectangles,groups).map(rectangles=>({rectangles,box:selectionBounds(rectangles)!}));
 const bounds=reference==='slide'?{x:0,y:0,width,height}:selectionBounds(rectangles);
 if(!bounds)return [];
 const positions=units.map(u=>({...u.box}));
 if(action.startsWith('distribute')){
  if(units.length<3)throw Error('请选择至少三个对象或组合进行分布');
  const axis=action==='distribute-x'?'x':'y',size=axis==='x'?'width':'height';
  const order=units.map((_,i)=>i).sort((a,b)=>positions[a][axis]-positions[b][axis]);
  const gap=(bounds[size]-units.reduce((sum,u)=>sum+u.box[size],0))/(units.length-1);
  let cursor=bounds[axis];
  for(const i of order){positions[i][axis]=cursor;cursor+=units[i].box[size]+gap;}
 }else for(const p of positions){
  if(action==='left')p.x=bounds.x;
  if(action==='center')p.x=bounds.x+(bounds.width-p.width)/2;
  if(action==='right')p.x=bounds.x+bounds.width-p.width;
  if(action==='top')p.y=bounds.y;
  if(action==='middle')p.y=bounds.y+(bounds.height-p.height)/2;
  if(action==='bottom')p.y=bounds.y+bounds.height-p.height;
 }
 return units.map((u,i)=>({type:'elements.arrange',slideId,action:'translate',rectangles:u.rectangles,dx:positions[i].x-u.box.x,dy:positions[i].y-u.box.y}))
  .filter(c=>Math.abs(c.dx)>1e-8||Math.abs(c.dy)>1e-8);
}
