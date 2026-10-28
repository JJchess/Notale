import {bindObjectMenu,type ObjectMenuItem} from '../state/object-menu';

export type FilmMenuEntry={id:string;label:string;shortcut?:string;icon?:string;separator?:boolean};
export const filmEditEntries:FilmMenuEntry[]=[
 {id:'copy',label:'复制',shortcut:'Ctrl/⌘ C',icon:'copy'},
 {id:'cut',label:'剪切',shortcut:'Ctrl/⌘ X',icon:'cut'},
 {id:'paste',label:'粘贴',shortcut:'Ctrl/⌘ V',icon:'paste'},
 {id:'duplicate-selection',label:'创建副本到播放头',shortcut:'Ctrl/⌘ D',icon:'duplicate'},
 {id:'delete',label:'删除',shortcut:'Delete',icon:'delete'},
 {id:'split',label:'在播放头处分割',separator:true},
 {id:'copy-attributes',label:'复制属性',shortcut:'Ctrl/⌘ Shift C'},
 {id:'paste-attributes',label:'粘贴属性…',shortcut:'Ctrl/⌘ Shift V'},
 {id:'link',label:'链接所选',separator:true},{id:'unlink',label:'取消链接'},
 {id:'detach',label:'分离声音'},{id:'nest',label:'嵌套序列'},
 {id:'clip-animation',label:'展开 / 收起动画',separator:true},{id:'clip-timing',label:'时间与淡入淡出…'},
 {id:'rhythm-analyze',label:'识别节拍…',separator:true},{id:'rhythm-visible',label:'显示 / 隐藏节拍'},
 {id:'rhythm-snap',label:'切换节拍吸附'},
 {id:'close-gap',label:'关闭播放头空隙',separator:true},{id:'close-gaps',label:'关闭全部空隙'},
 {id:'select-before',label:'选择播放头左侧'},{id:'select-after',label:'选择播放头右侧'},
];
export const filmObjectEntries:FilmMenuEntry[]=[
 {id:'copy',label:'复制',shortcut:'Ctrl/⌘ C',icon:'copy'},
 {id:'cut',label:'剪切',shortcut:'Ctrl/⌘ X',icon:'cut'},
 {id:'paste',label:'粘贴',shortcut:'Ctrl/⌘ V',icon:'paste'},
 {id:'duplicate',label:'创建对象副本',shortcut:'Ctrl/⌘ D',icon:'duplicate'},
 {id:'delete',label:'删除对象',shortcut:'Delete',icon:'delete'},
 {id:'properties',label:'对象属性',separator:true,icon:'format'},
];
export function filmMenuItems(entries:readonly FilmMenuEntry[],reason:(id:string)=>string|undefined,run:(id:string)=>unknown):ObjectMenuItem[]{
 return entries.map((entry,index)=>{const why=reason(entry.id);return {...entry,separator:index>0&&entry.separator,disabled:!!why,reason:why,danger:entry.id==='delete',run:()=>{const why=reason(entry.id);if(why)throw Error(why);return run(entry.id);}};});
}

/** One owner for all film surfaces. Captured context can never act on a later selection. */
export function filmContextMenu(o:{scope:()=>string;report:(message:string)=>void;signal:AbortSignal}){
 let restore=()=>{},valid=()=>true;
 const menu=bindObjectMenu(()=>restore(),error=>o.report(error instanceof Error?error.message:String(error)));
 o.signal.addEventListener('abort',()=>menu.dispose(),{once:true});
 return {
  open(x:number,y:number,items:ObjectMenuItem[],focus:()=>void,label:string){
   const stamp=o.scope();restore=focus;valid=()=>!o.signal.aborted&&stamp===o.scope();
   const wrap=(items:ObjectMenuItem[]):ObjectMenuItem[]=>items.map(item=>({...item,children:item.children?wrap(item.children):undefined,run:()=>{
    // Restore before execution: the command may open a dialog or replace its list.
    menu.close(true);return item.run?.();
   }}));
   menu.open(x,y,wrap(items),[],valid,label);
  },
  refresh(){if(menu.opened&&!valid())menu.close();},
  close:menu.close,
 };
}
