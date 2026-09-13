import type { Command } from "@notale/editor/browser";
import { TypographyCapture } from "./typography-capture";
import {
  typographyFields,
  typographyObjectStyle,
  typographySnapshot,
  typographyStyle,
} from "./typography";
import type { PropertyTransactions } from "./property-gesture";
export interface TypographyModel {
  key: string;
  snapshot: ReturnType<typeof typographySnapshot>;
  status: string;
  captured: boolean;
  transactions: PropertyTransactions;
  commands: (style: Record<string, string>) => Command[];
}
let model: TypographyModel | undefined, owner: symbol | undefined;
const listeners = new Set<() => void>();
const publish = (next: TypographyModel | undefined) => {
  model = next;
  for (const f of listeners) f();
};
export const typographyState = {
  getSnapshot: () => model,
  getServerSnapshot: () => undefined,
  subscribe: (f: () => void) => {
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  },
};
export function bindTypography(
  context: PropertyTransactions & {
    key: () => string;
    documentId: () => string;
    enabled: () => boolean;
    ready: () => boolean;
    ids: () => string[];
    objects: () => {
      id: string;
      locked: boolean;
      style: Record<string, string>;
    }[];
    slideId: () => string;
    capture: ConstructorParameters<typeof TypographyCapture>[0]["capture"];
    commands: (commands: Command[]) => Promise<unknown>;
  },
) {
  const identity = Symbol("typography");
  owner = identity;
  let disposed = false,
    last = "",
    scope = "";
  let session = 0;
  const active = () => !disposed && owner === identity,
    capture = new TypographyCapture(context);
  publish(undefined);
  function render() {
    if (!active()) return;
    if (!context.enabled() || !context.ready()) {
      last = "";
      scope = "";
      session++;
      capture.invalidate();
      if (model) publish(undefined);
      return;
    }
    const source = context.key();
    if (source === last) return;
    last = source;
    const ids = [...context.ids()],
      slideId = context.slideId(),
      documentId = context.documentId(),
      key = JSON.stringify([documentId, slideId, ids]);
    if (scope !== key) {
      scope = key;
      session++;
    }
    const currentSession = session;
    const next: TypographyModel = {
      key,
      snapshot:
        model?.key === key ? model.snapshot : typographySnapshot(ids, {}),
      status: "正在读取页面文字样式…",
      captured: false,
      transactions: context,
      commands(style) {
        if (
          !active() ||
          currentSession !== session ||
          documentId !== context.documentId() ||
          slideId !== context.slideId() ||
          JSON.stringify(ids) !== JSON.stringify(context.ids())
        )
          throw Error("选区已变化");
        const objects = new Map(
          context.objects().map((object) => [object.id, object]),
        );
        return ids
          .filter(
            (target) => objects.has(target) && !objects.get(target)!.locked,
          )
          .map((target) => ({
            type: "element.patch",
            slideId,
            target,
            patch: {
              style: typographyObjectStyle(style, objects.get(target)!.style),
            },
          }));
      },
    };
    publish(next);
    void capture
      .read(ids)
      .then((snapshot) => {
        if (!active() || !snapshot || context.key() !== source) return;
        publish({
          ...next,
          snapshot,
          captured: true,
          status: snapshot.mixed ? "混合样式" : "",
        });
      })
      .catch(() => {
        if (active() && context.key() === source) {
          last = "";
          publish({
            ...next,
            status: "暂未读取到页面样式，重新选择对象可重试。",
          });
        }
      });
  }
  return {
    render,
    disposeCapture() {
      disposed = true;
      capture.dispose();
      if (owner === identity) {
        owner = undefined;
        publish(undefined);
      }
    },
  };
}
export const typographyReset = () =>
  Object.fromEntries(
    [...typographyFields, "font-weight", "font-style", "text-orientation"].map(
      (id) => [id, ""],
    ),
  );
