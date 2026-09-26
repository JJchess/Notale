import type {Command} from '@notale/editor/browser';
import {useSyncExternalStore} from 'react';
export interface ViewSettings {enabled:boolean;visible:boolean;rulers:boolean;grid:number;}
const initial:ViewSettings={enabled:true,visible:true,rulers:false,grid:0};
let current=initial;
const listeners=new Set<()=>void>();
const key='notale-editor-snapping';
export const viewSettings={
 getSnapshot:()=>current,
 subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
 update(patch:Partial<ViewSettings>){
  const next={...current,...patch};
  if(!Number.isFinite(next.grid)||next.grid<0||next.grid>10000)throw Error('网格间距须为 0–10000');
  current=next;
  try{localStorage.setItem(key,JSON.stringify(current));}catch{}
  for(const listener of listeners)listener();
 },
 restore(){try{const saved=JSON.parse(localStorage.getItem(key)??'null');if(saved)this.update({enabled:saved.enabled!==false,visible:saved.visible!==false,rulers:saved.rulers===true,grid:Math.max(0,Math.min(10000,Number(saved.grid)||0))});}catch{}},
};
export const useViewSettings=()=>useSyncExternalStore(viewSettings.subscribe,viewSettings.getSnapshot,()=>initial);

export interface Guide {id:string;axis:'x'|'y';position:number;}
export interface GuideSource {documentId:string;pageId:string;}
export const guideActions:{edit:(source:GuideSource,guide:Guide,previous?:Guide,remove?:boolean)=>Promise<unknown>}={edit:async()=>{}};

export function bindGuideActions(context:{source:()=>GuideSource;guides:()=>Guide[];commands:(commands:Command[])=>Promise<unknown>}){
 guideActions.edit=async(source,guide,previous,remove)=>{
  const active=context.source();
  if(source.documentId!==active.documentId||source.pageId!==active.pageId)throw Error('页面已切换');
  if(!Number.isFinite(guide.position))throw Error('请输入有效坐标');
  const guides=context.guides(),existing=guides.find(g=>g.id===guide.id);
  if(previous&&(!existing||existing.axis!==previous.axis||existing.position!==previous.position))throw Error('参考线已变化，请核对后重试');
  if(!previous&&existing)throw Error('参考线已存在');
  await context.commands([{type:'slide.update',slideId:source.pageId,patch:{guides:remove?guides.filter(g=>g.id!==guide.id):previous?guides.map(g=>g.id===guide.id?guide:g):[...guides,guide]}}]);
 };
}
