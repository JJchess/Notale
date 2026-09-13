/** Base drafts retain their existing key; step drafts have an explicit namespace. */
export function chartBufferKey(chartKey:string,stepId?:string){return stepId?JSON.stringify(['chart-step',chartKey,stepId]):chartKey;}
export interface ChartBuffer {edgeMode:boolean;buffer:Record<string,unknown>[];bufferBase:Record<string,unknown>[];}
type StoragePort=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
function valid(value:any):value is ChartBuffer{return !!value&&typeof value.edgeMode==='boolean'&&[value.buffer,value.bufferBase].every(rows=>Array.isArray(rows)&&rows.every(row=>row&&typeof row==='object'&&!Array.isArray(row)));}
/** Memory remains authoritative if browser storage is unavailable. */
export class ChartBuffers {
 private entries=new Map<string,ChartBuffer|null>();
 constructor(private storage:()=>StoragePort=()=>localStorage){}
 set(key:string,value:ChartBuffer){const copy=structuredClone(value);this.entries.set(key,copy);this.storage().setItem('notale-chart-buffer:'+key,JSON.stringify(copy));}
 get(key:string){
  if(this.entries.has(key)){const value=this.entries.get(key);return value?structuredClone(value):undefined;}
  try{const raw=this.storage().getItem('notale-chart-buffer:'+key);if(!raw)return;const value=JSON.parse(raw);value.bufferBase??=[];if(valid(value)){this.entries.set(key,value);return structuredClone(value);}}catch{}
 }
 clear(key:string){this.entries.set(key,null);try{this.storage().removeItem('notale-chart-buffer:'+key);}catch{}}
 pending(){return [...this.entries].flatMap(([key,value])=>value?[{key,...structuredClone(value)}]:[]);}
}
