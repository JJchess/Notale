/** Film-only author properties. No additions to the lecture or server unions. */
export const filmNumericLimits = {
  x: [], y: [], width: [.01], height: [.01], rotation: [], skewX: [-89.999999,89.999999], scaleX: [], scaleY: [],
  opacity: [0,1], blur: [0], brightness: [0], contrast: [0], saturation: [0], hue: [], radius: [0],
  cropTop: [0,100], cropRight: [0,100], cropBottom: [0,100], cropLeft: [0,100],
} as const;
export const filmEnumValues = {
  blendMode: ['normal','multiply','screen','overlay','darken','lighten','color-dodge','color-burn','hard-light','soft-light','difference','exclusion','hue','saturation','color','luminosity'],
  fit: ['contain','cover','fill'], mask: ['none','ellipse','inset'],
} as const;
export type FilmProperty = keyof typeof filmNumericLimits | keyof typeof filmEnumValues;
export type FilmPropertyValue = number | string;
export type FilmEasing = 'linear' | 'hold' | [number,number,number,number];
export interface FilmKeyframe { frame: number; value: FilmPropertyValue; easing?: FilmEasing }
export interface FilmAppearance {
  values?: Partial<Record<FilmProperty,FilmPropertyValue>>;
  keyframes?: Partial<Record<FilmProperty,FilmKeyframe[]>>;
}
export function validFilmProperty(name: string, value: unknown): value is FilmPropertyValue {
  if (Object.hasOwn(filmNumericLimits,name)) {
    const [min,max] = filmNumericLimits[name as keyof typeof filmNumericLimits] as readonly number[];
    return typeof value==='number' && Number.isFinite(value) && (min===undefined||value>=min) && (max===undefined||value<=max);
  }
  return Object.hasOwn(filmEnumValues,name) && typeof value==='string' && (filmEnumValues[name as keyof typeof filmEnumValues] as readonly string[]).includes(value);
}
export function validFilmAppearance(value: unknown): value is FilmAppearance {
  if (!value || typeof value!=='object' || Array.isArray(value)) return false;
  const appearance=value as Record<string,unknown>;
  if (Object.keys(appearance).some(k=>!['values','keyframes'].includes(k))) return false;
  for (const collection of ['values','keyframes'] as const) {
    const entries=appearance[collection];if(entries===undefined)continue;
    if(!entries||typeof entries!=='object'||Array.isArray(entries))return false;
    for(const [property,payload] of Object.entries(entries)) {
      if(collection==='values'){if(!validFilmProperty(property,payload))return false;continue;}
      if(!Array.isArray(payload)||payload.length===0)return false;
      let previous=-Infinity;
      for(const key of payload){
        if(!key||typeof key!=='object'||!Number.isSafeInteger(key.frame)||key.frame<=previous||!validFilmProperty(property,key.value))return false;
        const ease=key.easing;
        if(ease!==undefined&&ease!=='linear'&&ease!=='hold'&&!(Array.isArray(ease)&&ease.length===4&&ease.every((x:unknown)=>typeof x==='number'&&Number.isFinite(x))&&ease[0]>=0&&ease[0]<=1&&ease[2]>=0&&ease[2]<=1))return false;
        previous=key.frame;
      }
    }
  }
  return true;
}
