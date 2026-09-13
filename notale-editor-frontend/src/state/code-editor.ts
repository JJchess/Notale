import type { Command } from "@notale/editor/browser";
import { highlight } from "../code-highlight";

export interface CodeItem {
  id: string;
  locked: boolean;
  text: string;
  html: string;
  attributes: Record<string, string>;
}
export interface CodeEditing {
  id: number;
  documentId: string;
  slideId: string;
  item: CodeItem;
}
export function codeDraft(item: CodeItem) {
  return {
    code: item.attributes["data-notale-code"] ?? item.text,
    language: item.attributes["data-notale-code-lang"] || "python",
  };
}
export function codeCommands(
  source: CodeEditing,
  current: { documentId: string; slideId: string; item?: CodeItem },
  code: string,
  language: string,
): Command[] {
  const item = current.item;
  if (
    current.documentId !== source.documentId ||
    current.slideId !== source.slideId ||
    item?.id !== source.item.id
  )
    throw Error("代码对象或页面已切换，输入已保留");
  if (item.locked) throw Error("代码对象已锁定");
  if (
    item.html !== source.item.html ||
    item.attributes["data-notale-code"] !==
      source.item.attributes["data-notale-code"] ||
    item.attributes["data-notale-code-lang"] !==
      source.item.attributes["data-notale-code-lang"]
  )
    throw Error("代码已变化，输入已保留，请重新打开编辑");
  const original = codeDraft(source.item);
  if (code === original.code && language === original.language) return [];
  return [
    {
      type: "element.content",
      slideId: source.slideId,
      target: item.id,
      html: highlight(code, language),
    },
    {
      type: "element.patch",
      slideId: source.slideId,
      target: item.id,
      patch: {
        attributes: {
          "data-notale-code": code,
          "data-notale-code-lang": language,
        },
      },
    },
  ];
}
const empty = {
  available: false,
  locked: false,
  editing: undefined as CodeEditing | undefined,
};
let model = empty,
  owner: symbol | undefined,
  counter = 0;
const listeners = new Set<() => void>();
function publish(next: typeof model) {
  model = next;
  for (const listener of listeners) listener();
}
export const codeState = {
  getSnapshot: () => model,
  getServerSnapshot: () => empty,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
export const codeActions = {
  open: () => {},
  close: () => {},
  save: async (_editing: CodeEditing, _code: string, _language: string) => {},
};
export function bindCodeEditor(context: {
  documentId: () => string;
  objects: () => CodeItem[];
  selection: () => string[];
  slideId: () => string;
  commands: (commands: Command[]) => Promise<unknown>;
}) {
  const identity = Symbol("code-editor");
  owner = identity;
  let disposed = false;
  const active = () => !disposed && owner === identity;
  publish(empty);
  function selected() {
    const ids = context.selection();
    const item =
      ids.length === 1
        ? context.objects().find((item) => item.id === ids[0])
        : undefined;
    return item?.attributes["data-notale-code"] !== undefined
      ? item
      : undefined;
  }
  codeActions.open = () => {
    if (!active()) return;
    const item = selected();
    if (!item || item.locked) return;
    publish({
      ...model,
      editing: {
        id: ++counter,
        documentId: context.documentId(),
        slideId: context.slideId(),
        item: structuredClone(item),
      },
    });
  };
  codeActions.close = () => {
    if (active()) publish({ ...model, editing: undefined });
  };
  codeActions.save = async (editing, code, language) => {
    if (!active() || model.editing?.id !== editing.id)
      throw Error("代码编辑已关闭");
    const commands = codeCommands(
      editing,
      {
        documentId: context.documentId(),
        slideId: context.slideId(),
        item: selected(),
      },
      code,
      language,
    );
    if (commands.length) await context.commands(commands);
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
