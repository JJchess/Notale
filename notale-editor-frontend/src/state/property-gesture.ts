import type {Command} from '@notale/editor/browser';
export interface PropertyTransactions {preview:(key:string,commands:Command[])=>void;commit:(key:string,commands?:Command[])=>Promise<void>;cancel:(key:string)=>Promise<void>;error:(error:unknown)=>void;}
const targets=(commands:Command[])=>JSON.stringify(commands.map(c=>'target'in c?[c.slideId,c.target]:c.type));
/** A gesture captures its original targets and carries the latest preview to one commit. */
export class PropertyGesture {
 private active?:{key:string;commands:Command[];value:string};
 constructor(private id:string,private context:PropertyTransactions,private uuid:()=>string=()=>crypto.randomUUID()){}
 get pending(){return !!this.active;}
 update(commands:Command[],initial:string){if(!commands.length)return;if(this.active&&targets(commands)!==targets(this.active.commands)){void this.finish().catch(this.context.error);return;}
  this.active??={key:this.id+':'+this.uuid(),commands:structuredClone(commands),value:initial};this.active.commands=structuredClone(commands);this.context.preview(this.active.key,this.active.commands);
 }
 async finish(){const current=this.active;if(!current)return;this.active=undefined;await this.context.commit(current.key,current.commands);}
 async commit(commands:Command[]){if(this.active)return this.finish();if(commands.length)await this.context.commit(this.id+':'+this.uuid(),structuredClone(commands));}
 cancel():{value:string;done:Promise<void>}|undefined{const current=this.active;if(!current)return;this.active=undefined;return {value:current.value,done:this.context.cancel(current.key)};}
}
