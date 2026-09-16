import type {Command} from '@notale/editor/browser';
import {selectedTable,tableCells,tableRegion,type TableItem,type TableCell} from './table-inspector';
import {tableCommands,type TableAction} from './table-commands';
export interface TableModel {key:string;documentId:string;slideId:string;table:TableItem;cells:TableCell[];columns:number;chosen:string;rangeEnd:string;locked:boolean;area:ReturnType<typeof tableRegion>;}
let model:TableModel|undefined,owner:symbol|undefined;const listeners=new Set<()=>void>();const publish=(next:TableModel|undefined)=>{model=next;for(const f of listeners)f();};
export const tableEditorState={getSnapshot:()=>model,getServerSnapshot:()=>undefined,subscribe:(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};}};
export const tableActions={choose:(_id:string,_extend:boolean)=>{},submit:async(_source:TableModel,_action:TableAction)=>{}};
export function bindTableEditor(context:{documentId:()=>string;slideId:()=>string;objects:()=>TableItem[];selection:()=>string[];select:(id:string)=>void;commands:(commands:Command[])=>Promise<unknown>}){
 const identity=Symbol('table');owner=identity;let disposed=false,signature='',chosen='',rangeEnd='',tableKey='';const active=()=>!disposed&&owner===identity;publish(undefined);
 function render(){if(!active())return;const objects=context.objects(),selected=context.selection(),table=selectedTable(objects,selected);if(!table){if(model)publish(undefined);signature='';return;}const key=JSON.stringify([context.documentId(),context.slideId(),table.id]);if(key!==tableKey){chosen='';rangeEnd='';tableKey=key;}
  const parsed=tableCells(table.html,objects),cells=parsed.cells;if(cells.some(c=>c.id===selected[0])&&selected[0]!==chosen){chosen=selected[0];rangeEnd='';}if(!cells.some(c=>c.id===chosen))chosen=cells[0]?.id??'';if(!cells.some(c=>c.id===rangeEnd))rangeEnd='';const area=tableRegion(cells,chosen,rangeEnd,objects);
  const next:TableModel={key,documentId:context.documentId(),slideId:context.slideId(),table,cells,columns:parsed.columns,chosen,rangeEnd,area,locked:table.locked||!!objects.find(o=>o.id===selected[0])?.locked};const sig=JSON.stringify(next);if(sig===signature)return;signature=sig;publish(next);
 }
 tableActions.choose=(id,extend)=>{if(!active()||!model?.cells.some(c=>c.id===id))return;if(extend&&chosen)rangeEnd=id;else{chosen=id;rangeEnd='';context.select(id);}render();};
 tableActions.submit=async(source,action)=>{if(!active())throw Error('编辑器已关闭');if(context.documentId()!==source.documentId||context.slideId()!==source.slideId)throw Error('页面已切换，输入已保留');const objects=context.objects(),table=selectedTable(objects,context.selection());if(!table||table.id!==source.table.id||table.html!==source.table.html)throw Error('表格已变化，输入已保留，请重新选择单元格');const commands=tableCommands({slideId:source.slideId,table,cells:tableCells(table.html,objects).cells,chosen:source.chosen,rangeEnd:source.rangeEnd,objects},action);if(commands.length)await context.commands(commands);render();};
 return {render,dispose(){disposed=true;if(owner===identity){owner=undefined;publish(undefined);}}};
}
