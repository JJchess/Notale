import { mediaSettingsSchema, type Command } from "@notale/editor/browser";
import { readMediaSettings, mediaGeometryCapabilities } from "./media-settings";
export type CropSettings = Pick<
  ReturnType<typeof mediaSettingsSchema.parse>,
  "crop" | "fit" | "positionX" | "positionY"
>;
type Item = {
  id: string;
  tag: string;
  locked: boolean;
  attributes: Record<string, string>;
  style: Record<string, string>;
};
const cropSource = (object: Item) =>
  JSON.stringify([
    object.attributes.src,
    object.attributes.srcset,
    object.attributes["data-notale-media"],
    object.style["object-fit"],
    object.style["object-position"],
    object.style["clip-path"],
  ]);
export interface CropContext {
  selected: () => Item | undefined;
  key: () => string;
  slideId: () => string;
  preview: () => string;
  capture: (
    ids: string[],
  ) => Promise<{ computedStyles: Record<string, Record<string, string>> }>;
  commands: (commands: Command[]) => Promise<unknown>;
}
export interface CropEditing {
  id: number;
  settings: CropSettings;
  src: string;
  ratio: number;
}
const empty = {
  available: false,
  locked: false,
  unsupported: false,
  editing: undefined as CropEditing | undefined,
};
let model = empty,
  owner: symbol | undefined,
  counter = 0;
const listeners = new Set<() => void>();
const publish = (next: typeof model) => {
  model = next;
  for (const f of listeners) f();
};
export const imageCropState = {
  getSnapshot: () => model,
  getServerSnapshot: () => empty,
  subscribe: (f: () => void) => {
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  },
};
export const imageCropActions = {
  open: () => {},
  close: () => {},
  save: async (_id: number, _settings: CropSettings) => {},
};
export function bindImageCrop(context: CropContext) {
  const identity = Symbol("crop");
  owner = identity;
  let disposed = false,
    key = "",
    target = "",
    slideId = "",
    baseline = "";
  const active = () => !disposed && owner === identity;
  publish(empty);
  function render() {
    if (!active()) return;
    const object = context.selected(),
      available = object?.tag === "img",
      locked = !!object?.locked,
      unsupported =
        !!object &&
        Object.values(mediaGeometryCapabilities(object)).some(
          (value) => !value,
        );
    if (
      model.available !== available ||
      model.locked !== locked ||
      model.unsupported !== unsupported
    )
      publish({ ...model, available, locked, unsupported });
  }
  const open = () => {
    if (!active()) return;
    const object = context.selected();
    if (!object || object.tag !== "img" || object.locked) return;
    if (
      Object.values(mediaGeometryCapabilities(object)).some((value) => !value)
    )
      throw Error("当前图片使用自定义取景，暂不支持矩形裁剪");
    const settings = readMediaSettings(object);
    baseline = cropSource(object);
    key = context.key();
    target = object.id;
    slideId = context.slideId();
    const capturedKey = key,
      capturedTarget = target;
    const editing: CropEditing = {
      id: ++counter,
      settings,
      src: new URL(object.attributes.src, context.preview()).href,
      ratio:
        (parseFloat(object.style.width) || 500) /
        (parseFloat(object.style.height) || 320),
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
        const styles = result.computedStyles[capturedTarget],
          w = parseFloat(styles?.width),
          h = parseFloat(styles?.height);
        if (w > 0 && h > 0)
          publish({ ...model, editing: { ...editing, ratio: w / h } });
      })
      .catch(() => {});
  };
  imageCropActions.open = open;
  imageCropActions.close = () => {
    if (active()) publish({ ...model, editing: undefined });
  };
  imageCropActions.save = async (id, settings) => {
    if (!active() || model.editing?.id !== id) throw Error("裁剪已关闭");
    if (context.key() !== key)
      throw Error("页面已变化，请关闭后重新打开裁剪。");
    const object = context.selected();
    if (!object || object.id !== target || object.locked)
      throw Error("图片已变化或锁定");
    if (cropSource(object) !== baseline)
      throw Error("图片取景或资源已变化，裁剪草稿已保留，请核对后重新打开。");
    const validated = mediaSettingsSchema.parse(settings);
    const before = model.editing.settings;
    const patch: Partial<CropSettings> = {};
    if (JSON.stringify(validated.crop) !== JSON.stringify(before.crop))
      patch.crop = validated.crop;
    if (validated.fit !== before.fit) patch.fit = validated.fit;
    if (
      validated.positionX !== before.positionX ||
      validated.positionY !== before.positionY
    ) {
      patch.positionX = validated.positionX;
      patch.positionY = validated.positionY;
    }
    if (!Object.keys(patch).length) {
      publish({ ...model, editing: undefined });
      return;
    }
    await context.commands([
      {
        type: "media.update",
        slideId,
        target,
        patch: {
          settings: patch,
        },
      },
    ]);
    if (active() && model.editing?.id === id)
      publish({ ...model, editing: undefined });
  };
  return {
    open,
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
