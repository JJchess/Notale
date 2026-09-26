import {DraftWrites} from './state/draft-writes';
import type { GeometrySession } from "./geometry-session.js";
import type { Pending } from "./pending-journal.js";
/** Text drafts use the document journal's existing staging protocol. */
export function createVectorIngress(
  queue: GeometrySession,
  documentId: () => string,
  version: () => number,
  error: (e: unknown) => void,
) {
  const drafts=new DraftWrites(task=>queue.stageText(task));
  let sealed=false;
  const finalizing=new Set<Promise<void>>();
  let write = Promise.resolve();
  const timers = new Set<string>();
  function flush(id?: string) {
    if(sealed)return Promise.resolve();
    const ids = id ? [id] : [...timers];
    for (const key of ids) timers.delete(key);
    const staging=write;
    const task=(async()=>{await staging;for(const key of ids)await queue.finalizeText(key);})();
    finalizing.add(task);
    void task.then(()=>finalizing.delete(task),()=>finalizing.delete(task));
    return task;
  }
  function receive(data: any) {
    if(sealed)return;
    const task: Pending = {
      documentId: documentId(),
      slideId: data.slideId,
      selection: [...data.selection],
      vector: true,
      request: {
        baseVersion: version(),
        mutationId: data.id,
        commands: structuredClone(data.commands),
      },
    };
    write = drafts.stage(task);
    void write.catch(error);
    timers.add(data.id);
    if (data.final) void flush(data.id).catch(error);
  }
  return { receive, flush,async seal(){sealed=true;const results=await Promise.allSettled([...finalizing]);await drafts.retain();const failures=results.filter((result):result is PromiseRejectedResult=>result.status==='rejected');if(failures.length)throw new AggregateError(failures.map(result=>result.reason),'图形草稿收尾失败');} };
}
