import type {Slide,Command} from '@notale/editor/browser';
interface Draft {name:string;notes:string;advance:string;}
interface Card {id:string;name:string;detail:string;}
interface Model {scope:string;ready:boolean;initialized:boolean;busy:boolean;cards:Card[];selected:string;index:number;draft:Draft;summary:string;error:string;choose?:(id:string)=>void;change?:(patch:Partial<Draft>)=>void;run?:(action:string)=>Promise<void>;move?:(id:string,target:string,after:boolean)=>Promise<void>;}
const initial:Model={scope:'',ready:false,initialized:false,busy:false,cards:[],selected:'',index:-1,draft:{name:'',notes:'',advance:''},summary:'',error:''};let model=initial,owner:symbol|undefined;const listeners=new Set<()=>void>();
export const teachingStepsState={getSnapshot:()=>model,getServerSnapshot:()=>initial,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};}};
export function bindTeachingSteps(context:{scope:()=>string;slide:()=>Slide;step:()=>number;nativeMax:()=>number;ready:()=>boolean;whenReady:()=>Promise<void>;preview:(index:number,play?:boolean)=>void;chooseAnimationStep:(index:number)=>void;commands:(commands:Command[])=>Promise<unknown>}){
 const token=Symbol();owner=token;let scope='',selected='',baseline='',dirty=false,generation=0;
 const active=()=>owner===token;
 const publish=(patch:Partial<Model>)=>{if(active()){model={...model,...patch};listeners.forEach(listener=>listener());}};
 function choose(id:string,preview=true){if(!active()||context.scope()!==scope)return;const index=context.slide().steps?.findIndex(step=>step.id===id)??-1;if(index<0)return;selected=id;dirty=false;publish({error:''});render();context.chooseAnimationStep(index);if(preview)context.preview(index);}
 async function run(action:string,move?:{id:string;target:string;after:boolean}){
  if(!active()||model.busy||!model.ready||context.scope()!==scope)return;
  const origin=scope,revision=generation,slide=context.slide(),steps=slide.steps??[],index=steps.findIndex(step=>step.id===selected),step=steps[index];
  const current=()=>active()&&context.scope()===origin&&generation===revision;
  publish({busy:true,error:''});
  try{
   let commands:Command[]=[],next:string|undefined;
   if(action==='initialize')commands=[{type:'step.initialize',slideId:slide.id,nativeMax:context.nativeMax()}];
   else if(action==='preview'){if(step)context.preview(index,true);return;}
   else if(action==='save'&&step){
    if(JSON.stringify(step)!==baseline)throw Error('步骤信息已变化，输入已保留，请重新选择步骤后核对');
    const advance=model.draft.advance.trim(),seconds=Number(advance);if(advance&&(!Number.isFinite(seconds)||seconds<0||seconds>3600))throw Error('自动前进须为 0–3600 秒');
    if(!model.draft.name.trim()||model.draft.name.length>200)throw Error('请输入不超过 200 字的步骤名称');
    commands=[{type:'step.update',slideId:slide.id,id:step.id,patch:{name:model.draft.name,notes:model.draft.notes,advanceAfter:advance?Math.round(seconds*1000):null}}];
   }else if(action==='insert'||action==='duplicate'){
    next=crypto.randomUUID();if(action==='duplicate'&&!step)return;
    commands=[action==='duplicate'?{type:'step.duplicate',slideId:slide.id,id:step.id,newId:next}:{type:'step.insert',slideId:slide.id,index:index+1,step:{id:next,name:'新步骤',notes:'',advanceAfter:null}}];
   }else if(action==='remove'&&step&&index>0)commands=[{type:'step.remove',slideId:slide.id,id:step.id}];
   else if((action==='up'||action==='down')&&step){const target=index+(action==='up'?-1:1);if(index<=0||target<1||target>=steps.length)return;commands=[{type:'step.move',slideId:slide.id,id:step.id,index:target}];}
   else if(action==='move'&&move){if(steps.findIndex(step=>step.id===move.id)<=0||move.id===move.target)return;const at=steps.filter(step=>step.id!==move.id).findIndex(step=>step.id===move.target);if(at<0)return;commands=[{type:'step.move',slideId:slide.id,id:move.id,index:Math.max(1,at+(move.after?1:0))}];next=move.id;}
   if(commands.length)await context.commands(commands);if(!current())return;if(action==='save')dirty=false;
   if(next){await context.whenReady();if(current())choose(next);}else render();
  }catch(cause){if(current())publish({error:cause instanceof Error?cause.message:String(cause)});}
  finally{if(current()){publish({busy:false});render();}}
 }
 function render(){
  if(!active())return;const nextScope=context.scope(),slide=context.slide(),steps=slide.steps;
  if(scope!==nextScope){scope=nextScope;selected='';dirty=false;generation++;publish({...initial,scope});}
  if(!steps?.some(step=>step.id===selected)){selected=steps?.[Math.min(context.step(),steps.length-1)]?.id??'';dirty=false;}
  const index=steps?.findIndex(step=>step.id===selected)??-1,step=steps?.[index];
  if(!dirty){baseline=JSON.stringify(step);publish({draft:step?{name:step.name,notes:step.notes,advance:step.advanceAfter===null?'':String(step.advanceAfter/1000)}:initial.draft});}
  const origin=scope,valid=()=>active()&&scope===origin&&context.scope()===origin;
  publish({summary:`${slide.animations.filter(cue=>cue.step===index).length} 个动画 · ${(slide.components??[]).filter(component=>component.steps.some(step=>step.step===index)).length} 个互动变化`,scope,ready:context.ready(),initialized:!!steps,selected,index,cards:(steps??[]).map((step,index)=>({id:step.id,name:step.name,detail:index===0?'初始画面':`${slide.animations.filter(cue=>cue.step===index).length} 个动画 · ${(slide.components??[]).filter(component=>component.steps.some(step=>step.step===index)).length} 个互动状态${step.advanceAfter?` · ${(step.advanceAfter/1000).toFixed(1)} 秒后前进`:''}`})),choose:id=>{if(valid()&&!model.busy)choose(id);},change:patch=>{if(valid()&&!model.busy){dirty=true;publish({draft:{...model.draft,...patch},error:''});}},run:async action=>{if(valid())await run(action);},move:async(id,target,after)=>{if(valid())await run('move',{id,target,after});}});
 }
 publish(initial);return {render,dispose(){if(active()){publish(initial);owner=undefined;generation++;}}};
}
