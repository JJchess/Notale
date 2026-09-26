import type { Command } from "@notale/editor/browser";
import {
  selectedStaticChart,
  staticChartDraft,
  draftChart,
  type StaticChartItem,
  type StaticChartDraft,
} from "./static-chart";
export interface StaticChartEditing {
  id: number;
  documentId: string;
  slideId: string;
  item: StaticChartItem;
  draft: StaticChartDraft;
}
const empty = {
  available: false,
  locked: false,
  editing: undefined as StaticChartEditing | undefined,
};
let model = empty,
  owner: symbol | undefined,
  counter = 0;
const listeners = new Set<() => void>();
function publish(next: typeof model) {
  model = next;
  for (const listener of listeners) listener();
}
export const staticChartState = {
  getSnapshot: () => model,
  getServerSnapshot: () => empty,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
export const staticChartActions = {
  open: () => {},
  close: () => {},
  convert: async () => {},
  save: async (_editing: StaticChartEditing, _draft: StaticChartDraft) => {},
};
export function bindStaticChart(context: {
  documentId: () => string;
  objects: () => StaticChartItem[];
  selection: () => string[];
  slideId: () => string;
  commands: (commands: Command[]) => Promise<unknown>;
}) {
  const identity = Symbol("static-chart");
  owner = identity;
  let disposed = false;
  const active = () => !disposed && owner === identity;
  const selected = () =>
    selectedStaticChart(context.objects(), context.selection());
  publish(empty);
  staticChartActions.open = () => {
    if (!active()) return;
    const item = selected();
    if (!item || item.locked) return;
    const draft = staticChartDraft(
      JSON.parse(item.attributes["data-notale-chart"]),
    );
    publish({
      ...model,
      editing: {
        id: ++counter,
        documentId: context.documentId(),
        slideId: context.slideId(),
        item: structuredClone(item),
        draft,
      },
    });
  };
  staticChartActions.close = () => {
    if (active()) publish({ ...model, editing: undefined });
  };
  staticChartActions.convert = async () => {
    if (!active()) throw Error("图表编辑已关闭");
    const item = selected();
    if (!item || item.locked) throw Error("请选择未锁定的图表");
    await context.commands([
      {
        type: "native-chart.convert",
        slideId: context.slideId(),
        target: item.id,
      },
    ]);
  };
  staticChartActions.save = async (editing, draft) => {
    if (!active() || model.editing?.id !== editing.id)
      throw Error("图表编辑已关闭");
    const item = selected();
    if (
      context.documentId() !== editing.documentId ||
      context.slideId() !== editing.slideId ||
      item?.id !== editing.item.id
    )
      throw Error("图表或页面已切换，输入已保留");
    if (item.locked) throw Error("图表已锁定");
    if (
      item.attributes["data-notale-chart"] !==
      editing.item.attributes["data-notale-chart"]
    )
      throw Error("图表数据已变化，输入已保留，请重新打开编辑");
    const data = draftChart(draft);
    if (JSON.stringify(data) !== JSON.stringify(draftChart(editing.draft)))
      await context.commands([
        {
          type: "chart.update",
          slideId: editing.slideId,
          target: item.id,
          data,
        },
      ]);
    if (active() && model.editing?.id === editing.id)
      publish({ ...model, editing: undefined });
  };
  return {
    render() {
      if (!active()) return;
      const item = selected(),
        available = !!item,
        locked = !!item?.locked;
      if (model.available !== available || model.locked !== locked)
        publish({ ...model, available, locked });
    },
    dispose() {
      disposed = true;
      if (owner === identity) {
        owner = undefined;
        publish(empty);
      }
    },
  };
}
