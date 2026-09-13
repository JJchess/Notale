export const cropEdges=['top','right','bottom','left'] as const;
export type CropEdge=typeof cropEdges[number];
export type Crop=Record<CropEdge,number>;
const opposite={top:'bottom',bottom:'top',left:'right',right:'left'} as const;
export function moveCrop(source:Crop,dx:number,dy:number,edge?:CropEdge):Crop{
 const crop={...source};if(!Number.isFinite(dx)||!Number.isFinite(dy))return crop;
 if(edge){const delta={top:dy,bottom:-dy,left:dx,right:-dx}[edge];crop[edge]=Math.max(0,Math.min(99-crop[opposite[edge]],crop[edge]+delta));}
 else{const x=Math.max(-crop.left,Math.min(crop.right,dx)),y=Math.max(-crop.top,Math.min(crop.bottom,dy));crop.left+=x;crop.right-=x;crop.top+=y;crop.bottom-=y;}
 return crop;
}
export function nudgeCrop(crop:Crop,edge:CropEdge,key:string,large=false):Crop|undefined{
 const vertical=edge==='top'||edge==='bottom';const deltas:Record<string,number>=vertical?{ArrowUp:-1,ArrowDown:1}:{ArrowLeft:-1,ArrowRight:1};const delta=deltas[key];
 if(!delta)return;return moveCrop(crop,vertical?0:delta*(large?10:1),vertical?delta*(large?10:1):0,edge);
}
