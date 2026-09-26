import {english,type MessageKey} from './catalog.js';
export {english,type MessageKey};
export type Locale='zh-CN'|'en-US';
/** The AI editing assistant's name: the same in every language, and the one place to change it. */
export const ASSISTANT_NAME='Istar';
export type MessageParams=Record<string,string|number>;
export interface LocalizedMessage {messageKey:MessageKey;messageParams?:MessageParams;}
export const isLocale=(value:unknown):value is Locale=>value==='zh-CN'||value==='en-US';
/** Stable quality order, with unsupported languages skipped. */
export function resolveLocale(saved:unknown,languages:string|string[]=[]):Locale{
 if(isLocale(saved))return saved;
 const list=(Array.isArray(languages)?languages:languages.split(',')).map((entry,index)=>{const [tag,...options]=entry.trim().split(';');const q=options.find(v=>v.trim().startsWith('q='));return {tag:tag.toLowerCase(),q:q?Number(q.trim().slice(2)):1,index};}).filter(v=>v.q>0).sort((a,b)=>b.q-a.q||a.index-b.index);
 for(const {tag}of list){if(/^zh(?:-|$)/.test(tag))return 'zh-CN';if(/^en(?:-|$)/.test(tag))return 'en-US';}return 'en-US';
}
export function formatMessage(locale:Locale,key:MessageKey,params:MessageParams={}):string{
 let template:string=locale==='en-US'?(english[key]??key):key;
 if(locale==='en-US')template=template.replace(/\{(\w+)\} (objects|animations|categories|series|matches|slides|trees|instances|cells|commands|changes)\b/g,(match,name:string,word:string)=>String(params[name])==='1'?`{${name}} `+({categories:'category',series:'series',matches:'match'}[word]??word.slice(0,-1)):match);
 return template.replace(/\{(\w+)\}/g,(match,name)=>params[name]===undefined?match:String(params[name]));
}
const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const aliases:Record<string,MessageKey>={'Operation failed; no partial revision was committed':'操作失败；未提交任何部分修改','Invalid request':'请求无效'};
const patterns=Object.keys(english).filter(key=>/\{\d+\}/.test(key)).map(key=>{
 const names:string[]=[];const parts=key.split(/(\{\d+\})/g);const pattern=parts.map(part=>{const match=/^\{(\d+)\}$/.exec(part);if(match){names.push(match[1]);return '([\\s\\S]*?)';}return escape(part);}).join('');
 return {key:key as MessageKey,names,re:new RegExp('^'+pattern+'$'),weight:key.replace(/\{\d+\}/g,'').length};
}).sort((a,b)=>b.weight-a.weight);
/** Resolve legacy product messages only at an explicit UI boundary. Never pass authored content here. */
export function describeMessage(source:string):LocalizedMessage|undefined{
 if(Object.hasOwn(aliases,source))return {messageKey:aliases[source]};
 if(Object.hasOwn(english,source))return {messageKey:source as MessageKey};
 for(const item of patterns){const match=item.re.exec(source);if(match)return {messageKey:item.key,messageParams:Object.fromEntries(item.names.map((name,i)=>[name,match[i+1]]))};}
 return undefined;
}
export function translateMessage(locale:Locale,source:string):string{
 if(!source)return source;
 if(locale==='zh-CN'&&!Object.hasOwn(aliases,source))return source;
 const descriptor=describeMessage(source);if(descriptor)return formatMessage(locale,descriptor.messageKey,descriptor.messageParams);
 const trimmed=source.trim();if(trimmed!==source){const message=describeMessage(trimmed);if(message)return source.slice(0,source.indexOf(trimmed))+formatMessage(locale,message.messageKey,message.messageParams)+source.slice(source.indexOf(trimmed)+trimmed.length);}
 // Error codes remain stable; the message following the code is presentation copy.
 const code=/^([A-Z][A-Z_0-9]+: |Error: )(.*)$/s.exec(source);if(code)return code[1]+translateMessage(locale,code[2]);
 return source;
}
