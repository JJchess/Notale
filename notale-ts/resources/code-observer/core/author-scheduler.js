/** Authoring has one active task and one latest request per lane, never a FIFO backlog. */
export class AuthorScheduler {
  constructor({run,render,stop,reply}) {Object.assign(this,{run,render,stop,reply});this.runVersion=0;this.renderVersion=0;this.busy=false;this.disposed=false;}
  submit(message) {
    if(this.disposed)return;
    if(message.action==='stop'){
      ++this.runVersion;++this.renderVersion;this.pendingRun=this.pendingRender=null;this.abort?.abort();this.stop(message.action);this.reply(message);return;
    }
    if(message.action==='run'){
      const version=++this.runVersion;this.pendingRun={message,version};this.pendingRender=null;++this.renderVersion;this.abort?.abort();this.stop(message.action);
    }else if(message.action==='render'){
      this.pendingRender={message,version:++this.renderVersion};if(this.active==='render')this.abort?.abort();
    }else return;
    void this.drain();
  }
  async drain(){
    if(this.busy)return;this.busy=true;
    try{while(!this.disposed&&(this.pendingRun||this.pendingRender)){
      const task=this.pendingRun||this.pendingRender,lane=this.pendingRun?'run':'render';
      if(lane==='run')this.pendingRun=null;else this.pendingRender=null;
      this.active=lane;const abort=new AbortController();this.abort=abort;
      const current=()=>!this.disposed&&!abort.signal.aborted&&task.version===(lane==='run'?this.runVersion:this.renderVersion);
      try{const value=await this[lane](task.message,{current,signal:abort.signal});if(current())this.reply(task.message,value);}catch(error){if(current())this.reply(task.message,undefined,error);}
    }}finally{this.busy=false;this.active=null;this.abort=null;}
  }
  dispose(){this.submit({action:'stop'});this.disposed=true;}
}
