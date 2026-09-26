import type {Command} from '@notale/editor/browser';
import {tableRegion,type TableItem,type TableCell} from './table-inspector';
export type TableAction={kind:'structure';action:Extract<Command,{type:'table.edit'}>['action']}|{kind:'text';value:string}|{kind:'style';property:string;value:string}|{kind:'font';value:string}|{kind:'border';mode:string;width:string;color:string};
export function tableCommands(source:{slideId:string;table:TableItem;cells:TableCell[];chosen:string;rangeEnd:string;objects:TableItem[]},action:TableAction):Command[]{
 const {slideId,table,cells,chosen,rangeEnd,objects}=source,area=tableRegion(cells,chosen,rangeEnd,objects),cell=cells.find(c=>c.id===chosen);
 if(table.locked||!cell||!area.picked.length||area.picked.some(c=>objects.find(o=>o.id===c.id)?.locked))throw Error('请选择可编辑的单元格');
 if(action.kind==='structure'){
  if(action.action==='merge'&&(!area.valid||area.picked.length<2))throw Error('请选择完整的矩形单元格区域');
  const region=action.action==='merge'?area:{row:cell.row,column:cell.column,rowSpan:1,colSpan:1};return [{type:'table.edit',slideId,target:table.id,action:action.action,row:region.row,column:region.column,rowSpan:region.rowSpan,colSpan:region.colSpan}];
 }
 if(action.kind==='text'){if(!cell.editable||area.picked.length!==1)throw Error('请选择单个纯文本单元格');if(action.value===cell.text)return [];return [{type:'element.patch',slideId,target:cell.id,patch:{text:action.value}}];}
 const patch=(style:(cell:TableCell)=>Record<string,string>):Command[]=>area.picked.map(cell=>({type:'element.patch',slideId,target:cell.id,patch:{style:style(cell)}}));
 if(action.kind==='style'){if(!['background-color','text-align','color'].includes(action.property))throw Error('不支持的表格样式');return patch(()=>({[action.property]:action.value}));}
 if(action.kind==='font'){const raw=action.value.trim(),size=Number(raw);if(raw&&(!Number.isFinite(size)||size<1||size>512))throw Error('字号应在 1 到 512 之间');return patch(()=>({'font-size':raw?`${size}px`:''}));}
 const {mode,color}=action,raw=action.width.trim(),width=Number(raw);if(!['all','outer','none'].includes(mode))throw Error('请选择边框范围');if(mode!=='none'&&(!raw||!Number.isFinite(width)||width<0||width>30))throw Error('边框粗细应在 0 到 30 之间');
 return patch(cell=>{const sides=mode==='outer'?[...(cell.row===area.row?['top']:[]),...(cell.column===area.column?['left']:[]),...(cell.row+cell.rowSpan===area.row+area.rowSpan?['bottom']:[]),...(cell.column+cell.colSpan===area.column+area.colSpan?['right']:[])]:['top','right','bottom','left'];const style:Record<string,string>={};for(const side of sides){style[`border-${side}-style`]=mode==='none'?'none':'solid';if(mode!=='none'){style[`border-${side}-width`]=`${width}px`;style[`border-${side}-color`]=color;}}return style;}).filter(command=>command.type==='element.patch'&&Object.keys(command.patch.style??{}).length);
}
