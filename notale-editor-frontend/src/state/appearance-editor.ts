import type { Command } from "@notale/editor/browser";
import { AppearanceCapture } from "./appearance-capture";
import {
  appearanceFields,
  appearanceSelection,
  appearanceEditFields,
  appearancePatch,
  isVector,
  type AppearanceObject,
} from "./appearance";
import type { PropertyTransactions } from "./property-gesture";
export interface AppearanceModel {
  key: string;
  sourceKey: string;
  captured: boolean;
  slideId: string;
  targets: AppearanceObject[];
  fields: Record<string, string | boolean>;
  objectFields: Record<string, Record<string, string | boolean>>;
  mixed: string[];
  rectangles: Record<string, { width: number; height: number }>;
  html: boolean;
  accent: boolean;
  fit: boolean;
  locked: boolean;
  transactions: PropertyTransactions;
  commands: (
    field: string,
    fields: Record<string, string | boolean>,
    changed?: string,
  ) => Command[];
}
let model: AppearanceModel | undefined, owner: symbol | undefined;
const listeners = new Set<() => void>();
const publish = (next: AppearanceModel | undefined) => {
  model = next;
  for (const f of listeners) f();
};
export const appearanceState = {
  getSnapshot: () => model,
  getServerSnapshot: () => undefined,
  subscribe: (f: () => void) => {
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  },
};
export function bindAppearance(
  context: PropertyTransactions & {
    objects: () => AppearanceObject[];
    selected: () => string[];
    key: () => string;
    slideId: () => string;
    documentId: () => string;
    capture: ConstructorParameters<typeof AppearanceCapture>[0]["capture"];
    commands: (commands: Command[]) => Promise<unknown>;
  },
) {
  const identity = Symbol("appearance");
  owner = identity;
  let disposed = false,
    last = "",
    scope = "";
  let session = 0;
  const active = () => !disposed && owner === identity;
  publish(undefined);
  const capture = new AppearanceCapture({
    key: context.key,
    capture: context.capture,
    accept(result) {
      if (active() && model)
        publish({
          ...model,
          captured: true,
          fields: result.fields,
          objectFields: result.objectFields,
          mixed: result.mixed,
          rectangles: result.rectangles,
        });
    },
  });
  function render() {
    if (!active()) return;
    const objects = context.objects(),
      targets = objects.filter((o) => context.selected().includes(o.id));
    if (!targets.length) {
      last = "";
      scope = "";
      session++;
      capture.invalidate();
      if (model) publish(undefined);
      return;
    }
    const sourceKey = context.key();
    if (last === sourceKey) return;
    last = sourceKey;
    const documentId = context.documentId(),
      slideId = context.slideId(),
      ids = targets.map((o) => o.id),
      key = JSON.stringify([documentId, slideId, ids]);
    if (scope !== key) {
      scope = key;
      session++;
    }
    const currentSession = session;
    const next: AppearanceModel = {
      key,
      sourceKey,
      captured: false,
      slideId,
      targets,
      ...(model?.key === key
        ? {
            fields: model.fields,
            objectFields: model.objectFields,
            mixed: model.mixed,
          }
        : appearanceSelection(targets)),
      rectangles: model?.key === key ? model.rectangles : {},
      html: targets.every((o) => !isVector(o)),
      accent: targets.every(
        (o) =>
          o.attributes["data-notale-smart"] !== undefined ||
          o.attributes["data-notale-wordart"] !== undefined,
      ),
      fit: targets.every(
        (o) =>
          /^(p|h[1-6]|pre|blockquote|li|span|div)$/.test(o.tag) &&
          !isVector(o) &&
          !objects.some((child) => child.parent === o.id),
      ),
      locked: targets.every((o) => o.locked),
      transactions: context,
      commands(field, fields, changed) {
        if (
          !active() ||
          currentSession !== session ||
          context.documentId() !== documentId ||
          context.slideId() !== slideId ||
          JSON.stringify(
            context
              .objects()
              .filter((o) => context.selected().includes(o.id))
              .map((o) => o.id),
          ) !== JSON.stringify(ids)
        )
          throw Error("选区已变化");
        return context
          .objects()
          .filter((o) => ids.includes(o.id) && !o.locked)
          .map((o) => ({
            type: "element.patch",
            slideId,
            target: o.id,
            patch: {
              style: appearancePatch(
                o,
                field,
                changed
                  ? appearanceEditFields(
                      model?.key === key
                        ? (model.objectFields[o.id] ??
                            appearanceFields(o.style, o))
                        : appearanceFields(o.style, o),
                      fields,
                      changed,
                    )
                  : fields,
                model?.key === key ? model.rectangles[o.id] : undefined,
              ),
            },
          }));
      },
    };
    publish(next);
    void capture.read(targets);
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
