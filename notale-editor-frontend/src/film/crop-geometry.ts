export const cropSides = ['cropLeft', 'cropRight', 'cropTop', 'cropBottom'] as const;
export type CropSide = typeof cropSides[number];
export type Crop = Record<CropSide, number>;
const clamp = (n:number,min:number,max:number) => Math.max(min,Math.min(max,n));
/** The largest rectangle of this ratio inside the current visible rectangle. */
export function fitCropRatio(crop:Crop,width:number,height:number,ratio:number):Crop {
  if (!(width>0&&height>0&&ratio>0&&Number.isFinite(ratio))) return {...crop};
  const w=width*(100-crop.cropLeft-crop.cropRight)/100,h=height*(100-crop.cropTop-crop.cropBottom)/100;
  const nextW=Math.min(w,h*ratio),nextH=nextW/ratio,dx=(w-nextW)/width*50,dy=(h-nextH)/height*50;
  return {cropLeft:crop.cropLeft+dx,cropRight:crop.cropRight+dx,cropTop:crop.cropTop+dy,cropBottom:crop.cropBottom+dy};
}
/** Keep the opposite edge's midpoint anchored; its perpendicular edges move together. */
export function resizeCrop(crop:Crop,side:CropSide,value:number,width:number,height:number,ratio?:number):Crop {
  const horizontal=side==='cropLeft'||side==='cropRight';
  const opposite=({cropLeft:'cropRight',cropRight:'cropLeft',cropTop:'cropBottom',cropBottom:'cropTop'} as const)[side];
  if (!ratio) return {...crop,[side]:clamp(value,0,99-crop[opposite])};
  const before=horizontal?crop.cropTop:crop.cropLeft,after=horizontal?crop.cropBottom:crop.cropRight,middle=(before+100-after)/2;
  const maxCross=Math.min(middle,100-middle)*2,factor=horizontal?width/height/ratio:height/width*ratio;
  const span=clamp(100-crop[opposite]-value,Math.min(1,1/factor),Math.min(100-crop[opposite],maxCross/factor)),cross=span*factor;
  return horizontal
    ? {...crop,[side]:100-crop[opposite]-span,cropTop:middle-cross/2,cropBottom:100-middle-cross/2}
    : {...crop,[side]:100-crop[opposite]-span,cropLeft:middle-cross/2,cropRight:100-middle-cross/2};
}
/** Moving the source inside a fixed frame reverses the movement of source crop edges. */
export function panCrop(crop:Crop,width:number,height:number,dx:number,dy:number) {
  dx=clamp(dx,-crop.cropRight*width/100,crop.cropLeft*width/100);dy=clamp(dy,-crop.cropBottom*height/100,crop.cropTop*height/100);
  return {dx,dy,crop:{cropLeft:crop.cropLeft-dx/width*100,cropRight:crop.cropRight+dx/width*100,cropTop:crop.cropTop-dy/height*100,cropBottom:crop.cropBottom+dy/height*100}};
}
