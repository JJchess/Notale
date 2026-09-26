import { commitSchema, type Command } from "@notale/editor/browser";
interface Source {
  documentId: string;
  pageId: string;
  target: string;
  style: Record<string, string>;
  attributes: Record<string, string>;
  html: string;
  disabled: boolean;
}
interface Model {
  scope: string;
  style: string;
  attributes: string;
  richText: string;
  disabled: boolean;
  error: string;
  change?: (field: "style" | "attributes" | "richText", value: string) => void;
  save?: (rich: boolean) => Promise<void>;
}
const initial: Model = {
  scope: "",
  style: "{}",
  attributes: "{}",
  richText: "",
  disabled: true,
  error: "",
};
let model = initial,
  owner: symbol | undefined;
const listeners = new Set<() => void>();
export const sourceEditorState = {
  getSnapshot: () => model,
  getServerSnapshot: () => initial,
  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
const scopeOf = (s: Source) =>
  JSON.stringify([s.documentId, s.pageId, s.target]);
const baseOf = (s: Source) => JSON.stringify([s.style, s.attributes]);
export function sourceEditorCommand(
  source: Pick<Source, "pageId" | "target">,
  draft: Pick<Model, "style" | "attributes" | "richText">,
  rich: boolean,
): Command {
  return commitSchema.parse({
    baseVersion: 1,
    mutationId: crypto.randomUUID(),
    commands: [
      {
        type: "element.patch",
        slideId: source.pageId,
        target: source.target,
        patch: rich
          ? { richText: draft.richText }
          : {
              style: JSON.parse(draft.style),
              attributes: JSON.parse(draft.attributes),
            },
      },
    ],
  }).commands[0];
}
export function createSourceEditor(context: {
  source: () => Source;
  commands: (commands: Command[]) => Promise<unknown>;
}) {
  const token = Symbol();
  owner = token;
  let current = initial,
    baseline = "",
    htmlBaseline = "",
    busy = false,
    session = 0;
  const dirty = new Set<"style" | "attributes" | "richText">();
  function publish(next: Model) {
    if (owner !== token) return;
    current = next;
    model = next;
    listeners.forEach((fn) => fn());
  }
  return {
    render() {
      if (owner !== token) return;
      const source = context.source(),
        scope = scopeOf(source),
        changed = scope !== current.scope;
      if (changed) {
        session++;
        busy = false;
      }
      const capturedSession = session;
      let draft = current;
      if (changed || !dirty.size) {
        draft = { ...initial, style: JSON.stringify(source.style, null, 2) };
        baseline = baseOf(source);
        htmlBaseline = source.html;
        dirty.clear();
      }
      const valid = () =>
        owner === token &&
        capturedSession === session &&
        scope === scopeOf(context.source());
      publish({
        ...draft,
        scope,
        disabled: source.disabled || busy,
        change: (field, value) => {
          if (!valid() || busy || current.disabled) return;
          dirty.add(field);
          publish({ ...current, [field]: value, error: "" });
        },
        save: async (rich) => {
          if (!valid() || busy || current.disabled) return;
          if (
            rich
              ? !dirty.has("richText")
              : !dirty.has("style") && !dirty.has("attributes")
          )
            return;
          busy = true;
          publish({ ...current, disabled: true, error: "" });
          try {
            const latest = context.source();
            if (latest.disabled) throw Error("对象不可编辑");
            if (rich && latest.html !== htmlBaseline)
              throw Error("对象内容已变化，HTML 草稿已保留，请重新选择后核对");
            if (!rich && baseOf(latest) !== baseline)
              throw Error("对象已变化，输入已保留，请重新选择后核对");
            const command = sourceEditorCommand(latest, current, rich);
            await context.commands([command]);
            if (valid()) {
              if (rich) {
                dirty.delete("richText");
                htmlBaseline = context.source().html;
              } else {
                dirty.delete("style");
                dirty.delete("attributes");
                baseline = baseOf(context.source());
              }
            }
          } catch (cause) {
            if (valid())
              publish({
                ...current,
                error: cause instanceof Error ? cause.message : String(cause),
              });
          } finally {
            if (valid()) {
              busy = false;
              publish({ ...current, disabled: context.source().disabled });
            }
          }
        },
      });
    },
    dispose() {
      if (owner === token) {
        publish(initial);
        owner = undefined;
      }
    },
  };
}
