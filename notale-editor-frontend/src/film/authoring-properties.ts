import {filmNumericLimits,filmEnumValues,type FilmEasing} from '@notale/editor/film';
export const propertyLabels:Record<string,string>={x:'位置 X',y:'位置 Y',width:'宽度',height:'高度',rotation:'旋转',skewX:'水平斜切',scaleX:'水平缩放',scaleY:'垂直缩放',opacity:'不透明度',blur:'模糊',brightness:'亮度',contrast:'对比度',saturation:'饱和度',hue:'色相',radius:'圆角',cropTop:'上裁切 %',cropRight:'右裁切 %',cropBottom:'下裁切 %',cropLeft:'左裁切 %',blendMode:'混合模式',fit:'画面适配',mask:'基础遮罩',translate:'偏移',rotate:'旋转',scale:'缩放',color:'文字颜色','background-color':'填充',fill:'图形填充',stroke:'描边',filter:'滤镜','border-radius':'圆角','z-index':'图层层级'};
export const objectProperties=['opacity','translate','rotate','scale','width','height','color','background-color','fill','stroke','filter','border-radius','z-index'];
export const clipProperties=[...Object.keys(filmNumericLimits),...Object.keys(filmEnumValues)];
export const propertyOptionLabels:Record<string,string>={normal:'正常',multiply:'正片叠底',screen:'滤色',overlay:'叠加',darken:'变暗',lighten:'变亮','color-dodge':'颜色减淡','color-burn':'颜色加深','hard-light':'强光','soft-light':'柔光',difference:'差值',exclusion:'排除',hue:'色相',saturation:'饱和度',color:'颜色',luminosity:'明度',contain:'完整显示',cover:'填满画框',fill:'拉伸填满',none:'无',ellipse:'椭圆',inset:'矩形裁切'};
export const easingPresets:Record<string,FilmEasing>={linear:'linear',hold:'hold',ease:[.25,.1,.25,1],'ease-in':[.42,0,1,1],'ease-out':[0,0,.58,1],'ease-in-out':[.42,0,.58,1]};
export function validEasing(value:unknown):value is FilmEasing{return value==='linear'||value==='hold'||Array.isArray(value)&&value.length===4&&value.every(n=>typeof n==='number'&&Number.isFinite(n))&&value[0]>=0&&value[0]<=1&&value[2]>=0&&value[2]<=1;}
export function propertyMetadata(name:string,object:boolean){
 const group=object?'对象 CSS':name.startsWith('crop')||['mask','fit'].includes(name)?'裁切与适配':['x','y','width','height','rotation','skewX','scaleX','scaleY'].includes(name)?'变换':'外观';
 if(!object&&Object.hasOwn(filmEnumValues,name))return {group,kind:'enum' as const,options:filmEnumValues[name as keyof typeof filmEnumValues] as readonly string[]};
 if(!object&&Object.hasOwn(filmNumericLimits,name)){const [min,max]=filmNumericLimits[name as keyof typeof filmNumericLimits] as readonly number[];return {group,kind:'number' as const,min,max};}
 return {group,kind:'css' as const};
}
