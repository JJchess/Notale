import type {Command,DeckDocument} from '@notale/editor/browser';
type Token = { key: string; label: string; fallback: string };
export const TOKENS: Token[] = [
  { key: '--model', label: '主色', fallback: '#17628E' },
  { key: '--text', label: '正文', fallback: '#142630' },
  { key: '--muted', label: '次级文字', fallback: '#50616B' },
  { key: '--bg', label: '页面底色', fallback: '#E8EEF1' },
  { key: '--rule', label: '分隔线', fallback: '#71828B' },
];
export const PRESETS: { name: string; values: Record<string, string> }[] = [
  { name: '讲义蓝', values: { '--model': '#17628E', '--text': '#142630', '--muted': '#50616B', '--bg': '#E8EEF1', '--rule': '#71828B' } },
  { name: '石墨', values: { '--model': '#3F4A57', '--text': '#15191E', '--muted': '#5A646F', '--bg': '#EDEFF1', '--rule': '#8B949D' } },
  { name: '松绿', values: { '--model': '#1F7A5C', '--text': '#12241D', '--muted': '#4B6459', '--bg': '#E9F1EC', '--rule': '#7B948A' } },
  { name: '朱红', values: { '--model': '#B23A32', '--text': '#241413', '--muted': '#6B4F4C', '--bg': '#F4EBEA', '--rule': '#A2837F' } },
  { name: '墨紫', values: { '--model': '#5B3FA0', '--text': '#1B1626', '--muted': '#584F6D', '--bg': '#EFECF6', '--rule': '#8C83A4' } },
  { name: '暗夜', values: { '--model': '#6FA8DC', '--text': '#F2F5F8', '--muted': '#A9B6C2', '--bg': '#161C22', '--rule': '#3C4854' } },
];
export const FONTS = ['system-ui', "'Microsoft YaHei'", "'PingFang SC'", "'Source Han Serif SC'", 'Georgia', 'Arial'];

export interface ThemeModel {key:string;value:string;theme:Record<string,string>;tokens?:Record<string,string>;}
let model:ThemeModel|undefined,owner:symbol|undefined;const listeners=new Set<()=>void>();
export const themePanelState={getSnapshot:()=>model,getServerSnapshot:()=>undefined,subscribe:(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};}};
const publish=(next:ThemeModel|undefined)=>{model=next;for(const f of listeners)f();};
export function themeCommand(doc:DeckDocument,source:ThemeModel,values:Record<string,string>):Command{
 if(doc.id!==source.key)throw Error('讲义已切换，输入已保留');
 const theme={...doc.theme};for(const [key,value]of Object.entries(values)){if(theme[key]!==source.theme[key])throw Error('主题已变化，输入已保留');if(value)theme[key]=value;else delete theme[key];}
 return {type:'deck.update',theme};
}
export const themePanelActions={save:async(_source:ThemeModel,_values:Record<string,string>)=>{}};
export function bindThemePanel(context:{document:()=>DeckDocument;commands:(commands:Command[])=>Promise<unknown>}){
 const identity=Symbol('theme');owner=identity;let disposed=false;const active=()=>!disposed&&owner===identity;publish(undefined);
 function render(){if(!active())return;const doc=context.document(),theme={...doc.theme},value=JSON.stringify(theme);if(model?.key===doc.id&&model.value===value)return;publish({key:doc.id,value,theme,tokens:doc.themeTokens});}
 themePanelActions.save=async(source,values)=>{if(!active())throw Error('编辑器已关闭');await context.commands([themeCommand(context.document(),source,values)]);render();};
 return {render,dispose(){disposed=true;if(owner===identity){owner=undefined;publish(undefined);}}};
}
