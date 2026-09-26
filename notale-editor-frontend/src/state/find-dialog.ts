import type { Command, DeckDocument } from "@notale/editor/browser";
import {
  TextSearchIndex,
  replacementCommands,
  type FindResult,
  type FindHit,
} from "./find-replace";
interface FindModel {
  open: boolean;
  query: string;
  replacement: string;
  sensitive: boolean;
  result?: FindResult;
  busy: boolean;
  status: string;
  error: string;
}
const empty: FindModel = {
  open: false,
  query: "",
  replacement: "",
  sensitive: false,
  busy: false,
  status: "输入要查找的文字。",
  error: "",
};
let model = empty,
  owner: symbol | undefined;
const listeners = new Set<() => void>();
const publish = (next: FindModel) => {
  model = next;
  for (const f of listeners) f();
};
export const findDialogState = {
  getSnapshot: () => model,
  getServerSnapshot: () => empty,
  subscribe: (f: () => void) => {
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  },
};
export const findActions = {
  open: (_query = "") => {},
  close: () => {},
  change: (
    _patch: Partial<Pick<FindModel, "query" | "replacement" | "sensitive">>,
  ) => {},
  search: () => {},
  replace: async () => {},
  go: async (_hit: FindHit) => {},
};
export function bindFindDialog(context: {
  document: () => DeckDocument;
  commands: (commands: Command[]) => Promise<unknown>;
  show: (id: string) => Promise<unknown>;
  select: (id: string) => void;
}) {
  const index = new TextSearchIndex();
  const identity = Symbol("find");
  owner = identity;
  let disposed = false;
  const active = () => !disposed && owner === identity;
  publish(empty);
  function search() {
    if (!active()) return;
    const result = index.find(context.document(), model.query, model.sensitive);
    publish({
      ...model,
      result,
      error: "",
      status: !model.query
        ? "输入要查找的文字。"
        : result.hits.length
          ? `找到 ${result.hits.length} 处`
          : "没有找到匹配的文字。",
    });
  }
  findActions.change = (patch) => {
    if (!active() || model.busy) return;
    publish({ ...model, ...patch });
    if (patch.query !== undefined || patch.sensitive !== undefined) search();
  };
  findActions.search = () => {
    if (!model.busy) search();
  };
  findActions.close = () => {
    if (active() && !model.busy)
      publish({ ...model, open: false, result: undefined });
  };
  findActions.replace = async () => {
    if (!active() || model.busy || !model.result?.hits.length) return;
    const result = model.result,
      replacement = model.replacement;
    publish({ ...model, busy: true, error: "" });
    try {
      await context.commands(
        replacementCommands(context.document(), result, replacement),
      );
      if (!active()) return;
      search();
      publish({ ...model, status: `已替换 ${result.hits.length} 处` });
    } catch (e) {
      if (active())
        publish({
          ...model,
          error: e instanceof Error ? e.message : String(e),
        });
    } finally {
      if (active()) publish({ ...model, busy: false });
    }
  };
  findActions.go = async (hit) => {
    if (!active() || model.busy || !model.result) return;
    const doc = model.result.documentId;
    if (context.document().id !== doc) {
      publish({ ...model, error: "讲义已切换，请重新查找" });
      return;
    }
    publish({ ...model, busy: true });
    try {
      await context.show(hit.slideId);
      if (active() && context.document().id === doc) context.select(hit.target);
    } catch (e) {
      if (active())
        publish({
          ...model,
          error: e instanceof Error ? e.message : String(e),
        });
    } finally {
      if (active()) publish({ ...model, busy: false });
    }
  };
  findActions.open = (query = "") => {
    if (!active() || model.busy) return;
    publish({ ...model, open: true, query: query || model.query });
    search();
  };
  return {
    open: findActions.open,
    dispose() {
      disposed = true;
      index.clear();
      if (owner === identity) {
        owner = undefined;
        publish(empty);
      }
    },
  };
}
