'use client';
import {useI18n} from '../i18n/react';

import {useState,useSyncExternalStore,Fragment,type ReactNode} from 'react';
import {insertCategories,type Item} from '../insert-panel';
import {insertActionsState,runInsert,showInsertionDrop} from '../state/insert-actions';
import {DiagramTemplates,DiagramStatus} from './template-library';
import {templateLibraryActions} from '../state/template-library';
import {AssetLibrary} from './asset-library';
function InsertButton({item,hidden=false,compact=!!item.preview}:{item:Item;hidden?:boolean;compact?:boolean}){
 const t=useI18n();

 const actions=useSyncExternalStore(insertActionsState.subscribe,insertActionsState.getSnapshot,insertActionsState.getServerSnapshot);
 const reason=actions?.unavailableReason?.(item.kind);
 return <button type="button" hidden={hidden} disabled={!actions} aria-disabled={!!reason||!actions} draggable={!!actions&&!reason} data-insert={item.kind} data-symbol={item.symbol} aria-label={t(item.title) ?? t("插入{0}", {"0": t(item.label)})} title={reason?t(reason):compact ? t(item.label) : (t(item.title) ?? t("插入{0}", {"0": t(item.label)}))} onClick={()=>{if(reason){actions?.error(new Error(reason));return;}if(actions)void runInsert(actions,item.kind,item.symbol);}} onDragStart={event=>{if(!actions||reason){event.preventDefault();return;}event.dataTransfer.setData('application/x-notale-insert',JSON.stringify({kind:item.kind,value:item.symbol}));event.dataTransfer.effectAllowed='copy';showInsertionDrop(actions,true);}} onDragEnd={()=>{if(actions)showInsertionDrop(actions,false);}}><span style={{display:'contents'}} dangerouslySetInnerHTML={{__html:item.preview}}/>{!compact && <span className="insert-item-label">{t(item.label)}</span>}</button>;
}
function IconGallery({items}:{items:Item[]}){
 const t=useI18n();
const [query,setQuery]=useState('');const normalized=query.trim().toLocaleLowerCase();return <><input id="icon-search" type="search" placeholder={t("搜索图标")} aria-label={t("搜索图标")} autoComplete="off" value={query} onChange={event=>setQuery(event.target.value)}/><div id="icon-gallery" className="resource-grid icon-grid">{items.map(item=><InsertButton key={item.kind} item={item} hidden={!!normalized&&!((item.title??`插入${item.label}`)+' '+t(item.title??item.label)+' '+item.kind).toLocaleLowerCase().includes(normalized)}/>)}</div></>;}
export function InsertCatalog({media}:{media?:ReactNode}){
 const t=useI18n();
const [mediaOpen,setMediaOpen]=useState(!!media);const categories=media?[...insertCategories.filter(category=>category.key==='media'),...insertCategories.filter(category=>category.key!=='media')]:insertCategories;return <>{categories.map(category=><details key={category.key} className="insert-category" data-insert-category={category.key} open={media?category.key==='media':category.open} onToggle={event=>{if(category.key==='media')setMediaOpen(event.currentTarget.open);if(category.key==='diagrams'&&event.currentTarget.open)void templateLibraryActions.ensure();}}><summary>{t(category.label)}</summary><section data-library={category.key}>{category.groups.map((group,index)=><Fragment key={group.id??index}>{group.label && <h3 className="insert-group-title">{t(group.label)}</h3>}{group.id==='icon-gallery' ? <IconGallery items={group.items}/> : <div id={group.id} className={'resource-grid '+(group.className??'')}>{category.key==='diagrams' ? <DiagramTemplates related={group.items.map(item=>({after:({'smart:process':'N01','smart:cycle':'N04','smart:list':'N07'} as Record<string,string>)[item.kind]??'',node:<InsertButton key={item.kind} item={item} compact/>}))}/> : group.items.map(item=><InsertButton key={item.kind+':'+(item.symbol??'')} item={item}/>)}</div>}</Fragment>)}{category.key==='diagrams' && <DiagramStatus/>}{category.key==='media' && <>{media??<AssetLibrary visible={mediaOpen}/>}</>}</section></details>)}</>;}
