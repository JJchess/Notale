import {typographySnapshot} from './typography';
/** Resolves only the latest live text selection; stale failures are discarded too. */
export class TypographyCapture {
 private generation=0;private disposed=false;
 constructor(private context:{key:()=>string;capture:(ids:string[])=>Promise<{computedStyles:Record<string,Record<string,string>>}>}){}
 async read(ids:string[]){if(this.disposed)return;const targets=[...ids],key=this.context.key(),generation=++this.generation;const current=()=>!this.disposed&&generation===this.generation&&key===this.context.key();
  try{const result=await this.context.capture(targets);if(current())return typographySnapshot(targets,result.computedStyles);}catch(error){if(current())throw error;}
 }
 invalidate(){this.generation++;}
 dispose(){this.disposed=true;this.invalidate();}
}
