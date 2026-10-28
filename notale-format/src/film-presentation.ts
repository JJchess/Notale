/** Presentation metadata uses CSS colors, with no resource URLs or declarations. */
export const validFilmColorValue=(value:unknown):value is string=>typeof value==='string'&&value.length<=128&&/^(?:#[\da-f]{3,8}|[a-z]+|(?:rgb|hsl)a?\([\d\s.,%+\-/]+\))$/i.test(value);
export interface FilmSubtitleStyle {
 fontFamily?:string;fontSize?:number;fontWeight?:number;italic?:boolean;
 color?:string;background?:string;highlight?:string;
 /** Percent anchors in the authoring stage; y is the bottom edge. */
 x?:number;y?:number;maxWidth?:number;align?:'left'|'center'|'right';
 outlineWidth?:number;outlineColor?:string;shadowBlur?:number;shadowColor?:string;
}
export function validFilmSubtitleStyle(value:unknown):value is FilmSubtitleStyle {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const bounds:Record<string,[number,number]>={fontSize:[1,500],fontWeight:[100,1000],x:[0,100],y:[0,100],maxWidth:[1,100],outlineWidth:[0,20],shadowBlur:[0,100]};
 return Object.entries(value).every(([key,v])=>v===undefined||bounds[key]?v===undefined||typeof v==='number'&&Number.isFinite(v)&&v>=bounds[key][0]&&v<=bounds[key][1]:['color','background','highlight','outlineColor','shadowColor'].includes(key)?validFilmColorValue(v):key==='fontFamily'?typeof v==='string'&&v.length>0&&v.length<256&&!/[;{}<>\n\r]/.test(v):key==='italic'?typeof v==='boolean':key==='align'&&['left','center','right'].includes(v));
}
