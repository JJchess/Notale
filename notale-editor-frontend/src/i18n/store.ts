import {isLocale,resolveLocale,translateMessage,formatMessage,type Locale,type MessageKey,type MessageParams} from '@notale/editor/i18n';
export {isLocale,resolveLocale};
export type {Locale,MessageKey,MessageParams};
export const LOCALE_KEY='notale-locale';
let current:Locale='zh-CN';
const listeners=new Set<()=>void>();
export const localeStore={getSnapshot:()=>current,subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}};
function update(locale:Locale){if(current===locale)return;current=locale;listeners.forEach(listener=>listener());}
export function setLocale(locale:Locale){
 update(locale);
 if(typeof document!=='undefined')document.cookie=`${LOCALE_KEY}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
 try{localStorage.setItem(LOCALE_KEY,locale);}catch{/* Session-only preference remains usable. */}
}
export function initializeLocale(initial:Locale){
 const cookie=typeof document==='undefined'?undefined:document.cookie.split('; ').find(value=>value.startsWith(LOCALE_KEY+'='))?.split('=')[1];
 let saved:unknown=cookie;try{if(!isLocale(saved))saved=localStorage.getItem(LOCALE_KEY);}catch{}
 update(isLocale(saved)?saved:initial);
 const storage=(event:StorageEvent)=>{if(event.key===LOCALE_KEY&&isLocale(event.newValue))update(event.newValue);};
 window.addEventListener('storage',storage);return()=>window.removeEventListener('storage',storage);
}
export function translator(locale:Locale){return <T>(value:T,params?:MessageParams):T=>{
 if(typeof value!=='string')return value;
 return (params?formatMessage(locale,value as MessageKey,params):translateMessage(locale,value)) as T;
};}
/** For imperative product UI only; React uses the provider-bound translator. */
export function translateUi<T>(value:T,params?:MessageParams):T{return translator(current)(value,params);}
/** Keep canonical messages in state, so an already-open error follows later locale changes. */
export function responseMessage(value:{messageKey?:unknown;messageParams?:unknown;message?:unknown},fallback:string):string{
 if(typeof value.messageKey==='string'){
  const params=value.messageParams&&typeof value.messageParams==='object'?Object.fromEntries(Object.entries(value.messageParams).filter(([,v])=>typeof v==='string'||typeof v==='number')) as MessageParams:{};
  return formatMessage('zh-CN',value.messageKey as MessageKey,params);
 }
 return typeof value.message==='string'?value.message:fallback;
}
