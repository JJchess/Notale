import type {ImportedDocument} from '../document-transfer';
interface Model {available:boolean;busy:boolean;message:string;result?:string;importFile?:(file:File,kind:'project'|'pptx')=>Promise<void>;exportFile?:(kind:'project'|'pdf')=>Promise<void>;openResult?:()=>Promise<void>;}
const initial:Model={available:false,busy:false,message:''};let model=initial,owner:symbol|undefined;const listeners=new Set<()=>void>();
export const documentIOState={getSnapshot:()=>model,getServerSnapshot:()=>initial,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};}};
export function bindDocumentIO(context:{documentId:()=>string;importFile:(file:File,kind:'project'|'pptx',active:()=>boolean)=>Promise<ImportedDocument>;open:(id:string)=>Promise<unknown>;exportFile:(kind:'project'|'pdf')=>Promise<void>;notice:(message:string)=>void}){
 const token=Symbol();owner=token;let busy=false;const active=()=>owner===token;
 const publish=(patch:Partial<Model>)=>{if(active()){model={...model,...patch};listeners.forEach(fn=>fn());}};
 const run=async(action:()=>Promise<void>)=>{if(!active()||busy)return;busy=true;publish({busy:true,message:''});try{await action();}catch(cause){publish({message:cause instanceof Error?cause.message:String(cause)});}finally{busy=false;publish({busy:false});}};
 model={...initial};publish({available:true,
  importFile:(file,kind)=>run(async()=>{const origin=context.documentId();publish({result:undefined,message:'正在导入…'});const result=await context.importFile(file,kind,active);if(!active())return;publish({result:result.id,message:'导入完成'});if(context.documentId()===origin){await context.open(result.id);if(active())publish({result:undefined,message:''});}if(active()&&result.skipped)context.notice(`导入完成，跳过 ${result.skipped} 个无法读取的元素（表格、图表、艺术效果等）。`);}),
  exportFile:kind=>run(()=>context.exportFile(kind)),
  openResult:()=>run(async()=>{const id=model.result;if(id){await context.open(id);publish({result:undefined});}}),
 });
 return {dispose(){if(active()){publish({...initial});owner=undefined;}}};
}
