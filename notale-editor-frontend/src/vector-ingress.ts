import type { GeometrySession } from "./geometry-session.js";
import type { Pending } from "./pending-journal.js";
/** Text drafts use the document journal's existing staging protocol. */
export function createVectorIngress(
  queue: GeometrySession,
  documentId: () => string,
  version: () => number,
  error: (e: unknown) => void,
) {
  let write = Promise.resolve();
  const timers = new Set<string>();
  async function flush(id?: string) {
    const ids = id ? [id] : [...timers.keys()];
    for (const key of ids) {
      timers.delete(key);
    }
    await write;
    for (const key of ids) await queue.finalizeText(key);
  }
  function receive(data: any) {
    const task: Pending = {
      documentId: documentId(),
      slideId: data.slideId,
      selection: data.selection,
      vector: true,
      request: {
        baseVersion: version(),
        mutationId: data.id,
        commands: data.commands,
      },
    };
    write = write.catch(() => {}).then(() => queue.stageText(task));
    void write.catch(error);
    timers.add(data.id);
    if (data.final) void flush(data.id).catch(error);
  }
  return { receive, flush };
}
