import type { Command } from "@notale/editor/browser";
import {
  createRichTextDraft,
  richTextSource,
  type RichTextObject,
} from "./rich-text-draft";
export interface RichEditorContext {
  selected: () => RichTextObject | undefined;
  key: () => string;
  slideId: () => string;
  commands: (commands: Command[]) => Promise<unknown>;
  capture: (
    ids: string[],
  ) => Promise<{ computedStyles: Record<string, Record<string, string>> }>;
}
export interface RichEditing {
  id: symbol;
  html: string;
  blockEditing: boolean;
  styles: Record<string, string>;
}
interface RichModel {
  available: boolean;
  locked: boolean;
  editing?: RichEditing;
}
const empty: RichModel = { available: false, locked: false };
let model = empty,
  owner: symbol | undefined;
const listeners = new Set<() => void>();
export const richEditorState = {
  getSnapshot: () => model,
  getServerSnapshot: () => empty,
  subscribe: (f: () => void) => {
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  },
};
const publish = (value: RichModel) => {
  model = value;
  for (const f of listeners) f();
};
export const richEditorActions = {
  open: () => {},
  close: () => {},
  save: async (
    _id: symbol,
    _html: string,
    _alignment?: "left" | "center" | "right" | "justify",
    _decoration?: "none",
  ) => {},
};
export function bindRichEditor(context: RichEditorContext) {
  const identity = Symbol("rich-editor");
  owner = identity;
  let disposed = false,
    key = "",
    target = "",
    originalHtml = "",
    slideId = "";
  const draft = createRichTextDraft();
  const active = () => !disposed && owner === identity;
  publish(empty);
  function render() {
    if (!active()) return;
    const object = context.selected(),
      available = !!object && !!richTextSource(object),
      locked = !!object?.locked;
    if (model.available !== available || model.locked !== locked)
      publish({ ...model, available, locked });
  }
  richEditorActions.close = () => {
    if (active()) {
      draft.clear();
      publish({ ...model, editing: undefined });
    }
  };
  richEditorActions.open = () => {
    if (!active()) return;
    const object = context.selected();
    if (!object || object.locked) return;
    const root = richTextSource(object);
    if (!root) return;
    key = context.key();
    target = object.id;
    originalHtml = object.html;
    slideId = context.slideId();
    const capturedKey = key,
      capturedTarget = target;
    const editing: RichEditing = {
      id: Symbol("rich-draft"),
      html: draft.prepare(root),
      blockEditing: ["div", "section", "article", "li", "blockquote"].includes(
        object.tag,
      ),
      styles: {},
    };
    publish({ ...model, editing });
    void context
      .capture([capturedTarget])
      .then((result) => {
        if (
          !active() ||
          model.editing?.id !== editing.id ||
          context.key() !== capturedKey
        )
          return;
        publish({
          ...model,
          editing: {
            ...editing,
            styles: result.computedStyles[capturedTarget] ?? {},
          },
        });
      })
      .catch(() => {});
  };
  richEditorActions.save = async (id, html, alignment, decoration) => {
    if (!active() || model.editing?.id !== id) throw Error("文字编辑已关闭");
    if (key !== context.key())
      throw Error("页面已变化，请关闭后重新打开文字编辑。");
    const object = context.selected();
    if (!object || object.id !== target || object.locked)
      throw Error("对象已变化或锁定");
    if (object.html !== originalHtml)
      throw Error("文字对象已变化，输入已保留，请核对后重新编辑");
    await context.commands([
      {
        type: "element.patch",
        slideId,
        target,
        patch: {
          richText: draft.serialize(html),
          ...(alignment || decoration
            ? {
                style: {
                  ...(alignment ? { "text-align": alignment } : {}),
                  ...(decoration ? { "text-decoration": decoration } : {}),
                },
              }
            : {}),
        },
      },
    ]);
    if (active() && model.editing?.id === id) {
      draft.clear();
      publish({ ...model, editing: undefined });
    }
  };
  return {
    render,
    dispose() {
      if (disposed) return;
      disposed = true;
      draft.clear();
      if (owner === identity) {
        owner = undefined;
        publish(empty);
      }
    },
  };
}
