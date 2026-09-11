import type { Command } from '@notale/editor/browser';
export type PropertyTransactions = {
  preview:(key:string,commands:Command[])=>void;
  commit:(key:string,commands?:Command[])=>Promise<void>;
  cancel:(key:string)=>Promise<void>;
  error:(error:unknown)=>void;
};
/** All continuous property controls use one lifecycle and one undo boundary. */
export function bindPropertyInput(input:HTMLInputElement, read:()=>Command[], context:PropertyTransactions) {
  let active:{key:string;commands:Command[];value:string}|undefined,keyboard=false;
  const finish=()=>{const current=active;if(!current)return;active=undefined;keyboard=false;input.dataset.initial=input.value;void context.commit(current.key,current.commands).catch(context.error);};
  input.addEventListener('input',()=>{
    if(!input.validity.valid)return;
    const commands=read();if(!commands.length)return;
    active??={key:input.id+':'+crypto.randomUUID(),commands,value:input.dataset.initial??input.defaultValue};
    // Keep the original targets if a native picker reports its final event late.
    if(JSON.stringify(commands.map(c=>'target'in c?[c.slideId,c.target]:c.type))!==JSON.stringify(active.commands.map(c=>'target'in c?[c.slideId,c.target]:c.type))){finish();return;}
    active.commands=commands;try{context.preview(active.key,commands);}catch(error){context.error(error);}
  });
  input.addEventListener('change',()=>{
    if(!input.reportValidity())return;
    if(keyboard)return;
    if(active)finish();else if(input.value!==input.dataset.initial){const commands=read();if(commands.length)void context.commit(input.id+':'+crypto.randomUUID(),commands).catch(context.error);}
  });
  input.addEventListener('blur',finish);
  input.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&active){event.preventDefault();const current=active;active=undefined;keyboard=false;input.value=current.value;void context.cancel(current.key).catch(context.error);}
    else if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown'].includes(event.key))keyboard=true;
    else if(event.key==='Enter')finish();
  });
  input.addEventListener('keyup',()=>{if(keyboard)finish();});
  input.addEventListener('pointercancel',()=>{if(active){const current=active;active=undefined;input.value=current.value;void context.cancel(current.key).catch(context.error);}});
}
