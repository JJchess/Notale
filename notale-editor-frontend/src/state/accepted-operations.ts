/** Tracks accepted asynchronous work before it reaches the persistent command queue.
 * Waiting is an external boundary: an operation must never wait on its own group.
 */
export class AcceptedOperations {
 private pending=new Set<Promise<unknown>>();
 run<T>(operation:()=>Promise<T>):Promise<T>{
  let task:Promise<T>;try{task=operation();}catch(cause){return Promise.reject(cause);}this.pending.add(task);
  void task.then(()=>this.pending.delete(task),()=>this.pending.delete(task));
  return task;
 }
 async whenIdle(){await waitForOperations(()=>this.pending);}
}

/** Wait for all work observed at this boundary, including work accepted while waiting.
 * A failed operation must not let the boundary return while another operation runs.
 */
export async function waitForOperations(pending:()=>Iterable<Promise<unknown>>):Promise<void>{
 const failures:unknown[]=[];
 for(;;){
  const tasks=[...pending()];if(!tasks.length)break;
  const settled=await Promise.allSettled(tasks);
  for(const result of settled)if(result.status==='rejected')failures.push(result.reason);
 }
 if(failures.length===1)throw failures[0];
 if(failures.length>1)throw new AggregateError(failures,'部分已接收操作失败');
}
