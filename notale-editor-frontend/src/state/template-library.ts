import type {Entry} from '../template-library';
export type TemplateKind='page'|'diagram';
interface Preview {entry:Entry;kind:TemplateKind;}
interface Model {available:boolean;entries?:Entry[];query:string;loading:boolean;error:string;preview?:Preview;busy:boolean;message:string;}
const initial:Model={available:false,query:'',loading:false,error:'',busy:false,message:''};
let model=initial,owner:symbol|undefined;
const listeners=new Set<()=>void>();
export const templateLibraryState={getSnapshot:()=>model,getServerSnapshot:()=>initial,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};}};
interface Context {catalog:()=>Promise<Entry[]>;preload:(id:string,kind:TemplateKind)=>Promise<unknown>;insert:(id:string,kind:TemplateKind,progress:(message:string)=>void)=>Promise<void>;error:(cause:unknown)=>void;}
let actions:ReturnType<typeof bindTemplateLibrary>|undefined;
export const templateLibraryActions={ensure:()=>actions?.ensure(),search:(query:string)=>actions?.search(query),open:(id:string,kind:TemplateKind)=>actions?.open(id,kind),close:()=>actions?.close(),insert:()=>actions?.insert()};
export function bindTemplateLibrary(context:Context){
 const token=Symbol();owner=token;
 const active=()=>owner===token;
 const publish=(patch:Partial<Model>)=>{if(!active())return;model={...model,...patch};listeners.forEach(fn=>fn());};
 model={...initial};publish({available:true});
 const binding={
  async ensure(){
   if(!active()||model.entries||model.loading)return;
   publish({loading:true,error:''});
   try{publish({entries:await context.catalog()});}
   catch(cause){publish({error:'加载失败，请重试'});if(active())context.error(cause);}
   finally{publish({loading:false});}
  },
  search(query:string){publish({query});},
  open(id:string,kind:TemplateKind){
   if(!active()||model.busy)return;const entry=model.entries?.find(item=>item.id===id);
   if(!entry||kind==='diagram'&&!entry.diagram)return;
   publish({preview:{entry,kind},message:''});void context.preload(id,kind).catch(()=>{});
  },
  close(){if(active()&&!model.busy)publish({preview:undefined,message:''});},
  async insert(){
   if(!active()||model.busy||!model.preview)return;
   const {entry,kind}=model.preview;publish({busy:true,message:'正在加载模板…'});
   try{await context.insert(entry.id,kind,message=>publish({message}));publish({preview:undefined,message:''});}
   catch(cause){publish({message:cause instanceof Error?cause.message:'插入失败，请重试'});if(active())context.error(cause);}
   finally{publish({busy:false});}
  },
  dispose(){if(active()){publish({...initial});owner=undefined;actions=undefined;}},
 };
 actions=binding;return binding;
}
