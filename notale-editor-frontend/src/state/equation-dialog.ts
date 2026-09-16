import type { Command } from "@notale/editor/browser";
import {
  selectedEquation,
  equationCommands,
  type EquationItem,
  type EquationSource,
} from "./equation-editor";
export interface EquationEditing {
  id: number;
  source: EquationSource;
  tex: string;
  display: boolean;
}
const empty = {
  available: false,
  locked: false,
  editing: undefined as EquationEditing | undefined,
};
let model = empty,
  owner: symbol | undefined,
  counter = 0;
const listeners = new Set<() => void>();
const publish = (next: typeof model) => {
  model = next;
  for (const f of listeners) f();
};
export const equationState = {
  getSnapshot: () => model,
  getServerSnapshot: () => empty,
  subscribe: (f: () => void) => {
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  },
};
export const equationActions = {
  open: () => {},
  close: () => {},
  save: async (
    _editing: EquationEditing,
    _tex: string,
    _display: boolean,
    _html: string,
  ) => {},
};
export function bindEquation(context: {
  documentId: () => string;
  objects: () => EquationItem[];
  selection: () => string[];
  slideId: () => string;
  commands: (commands: Command[]) => Promise<unknown>;
}) {
  const identity = Symbol("equation");
  owner = identity;
  let disposed = false;
  const active = () => !disposed && owner === identity;
  publish(empty);
  const selected = () =>
    selectedEquation(context.objects(), context.selection());
  function render() {
    if (!active()) return;
    const item = selected(),
      available = !!item,
      locked = !!item?.locked;
    if (model.available !== available || model.locked !== locked)
      publish({ ...model, available, locked });
  }
  equationActions.open = () => {
    if (!active()) return;
    const item = selected();
    if (!item || item.locked) return;
    publish({
      ...model,
      editing: {
        id: ++counter,
        source: {
          documentId: context.documentId(),
          slideId: context.slideId(),
          item: structuredClone(item),
        },
        tex: item.attributes["data-notale-tex"],
        display: item.attributes["data-notale-tex-display"] !== "0",
      },
    });
  };
  equationActions.close = () => {
    if (active()) publish({ ...model, editing: undefined });
  };
  equationActions.save = async (editing, tex, display, html) => {
    if (!active() || model.editing?.id !== editing.id)
      throw Error("公式编辑已关闭");
    const commands = equationCommands(
      editing.source,
      {
        documentId: context.documentId(),
        slideId: context.slideId(),
        item: selected(),
      },
      tex,
      display,
      html,
    );
    if (commands.length) await context.commands(commands);
    if (active() && model.editing?.id === editing.id)
      publish({ ...model, editing: undefined });
  };
  return {
    render,
    dispose() {
      disposed = true;
      if (owner === identity) {
        owner = undefined;
        publish(empty);
      }
    },
  };
}
