import type { Command, DeckDocument, Slide } from "@notale/editor/browser";
export interface BackgroundPaint {
  base: string;
  end: string;
  angle: number;
  gradient: boolean;
}
export interface BackgroundModel {
  key: string;
  documentId: string;
  pageId: string;
  signature: string;
  value: BackgroundPaint;
  overridden: boolean;
}
let model: BackgroundModel | undefined, owner: symbol | undefined;
const listeners = new Set<() => void>();
export const backgroundState = {
  getSnapshot: () => model,
  getServerSnapshot: () => undefined,
  subscribe: (f: () => void) => {
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  },
};
const publish = (next: BackgroundModel | undefined) => {
  model = next;
  for (const f of listeners) f();
};
const signature = (doc: DeckDocument, page: Slide) =>
  JSON.stringify([
    page.theme?.["--bg"],
    page.theme?.["--page-background"],
    doc.theme?.["--bg"],
  ]);
export function backgroundCommands(
  doc: DeckDocument,
  page: Slide,
  source: BackgroundModel,
  value: BackgroundPaint | undefined,
  all = false,
): Command[] {
  if (doc.id !== source.documentId || page.id !== source.pageId)
    throw Error("页面已切换，输入已保留");
  if (signature(doc, page) !== source.signature)
    throw Error("背景已变化，输入已保留，请重新打开面板");
  if (
    value &&
    (!/^#[0-9a-f]{6}$/i.test(value.base) ||
      !/^#[0-9a-f]{6}$/i.test(value.end) ||
      !Number.isFinite(value.angle) ||
      value.angle < 0 ||
      value.angle > 360)
  )
    throw Error("请输入有效颜色及 0–360 度角度");
  const paint: Record<string, string> = value
    ? {
        "--bg": value.gradient
          ? `linear-gradient(${value.angle}deg, ${value.base}, ${value.end})`
          : value.base,
        "--page-background": value.base,
      }
    : {};
  return (all ? doc.slides : [page]).map((slide) => {
    const theme = { ...slide.theme };
    delete theme["--bg"];
    delete theme["--page-background"];
    return {
      type: "slide.update",
      slideId: slide.id,
      patch: { theme: { ...theme, ...paint } },
    };
  });
}
export const backgroundActions = {
  save: async (
    _source: BackgroundModel,
    _value: BackgroundPaint | undefined,
    _all = false,
  ) => {},
};
export function bindPageBackground(context: {
  document: () => DeckDocument;
  slide: () => Slide;
  commands: (commands: Command[]) => Promise<unknown>;
}) {
  const identity = Symbol("background");
  owner = identity;
  let disposed = false;
  const active = () => !disposed && owner === identity;
  publish(undefined);
  function render() {
    if (!active()) return;
    const doc = context.document(),
      page = context.slide(),
      theme = page.theme ?? {},
      sig = signature(doc, page),
      key = JSON.stringify([doc.id, page.id]);
    if (model?.key === key && model.signature === sig) return;
    const image = theme["--bg"] ?? doc.theme?.["--bg"] ?? "",
      gradient = image.includes("linear-gradient"),
      stops = [...image.matchAll(/#[0-9a-f]{3,8}|rgba?\([^)]+\)/gi)].map(
        (m) => m[0],
      );
    const color = (raw: string) => {
      if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
      if (/^#[0-9a-f]{3}$/i.test(raw))
        return "#" + [...raw.slice(1)].map((c) => c + c).join("");
      return "#e8eef1";
    };
    publish({
      key,
      documentId: doc.id,
      pageId: page.id,
      signature: sig,
      overridden: !!theme["--bg"] || !!theme["--page-background"],
      value: {
        base: color(
          (
            theme["--page-background"] ??
            (gradient ? stops[0] : image) ??
            "#e8eef1"
          ).trim(),
        ),
        end: color(stops.at(-1) ?? "#ffffff"),
        angle: Number(/(-?\d+(?:\.\d+)?)deg/.exec(image)?.[1] ?? 160),
        gradient,
      },
    });
  }
  backgroundActions.save = async (source, value, all = false) => {
    if (!active()) throw Error("编辑器已关闭");
    await context.commands(
      backgroundCommands(
        context.document(),
        context.slide(),
        source,
        value,
        all,
      ),
    );
    render();
  };
  return {
    render,
    dispose() {
      disposed = true;
      if (owner === identity) {
        owner = undefined;
        publish(undefined);
      }
    },
  };
}
