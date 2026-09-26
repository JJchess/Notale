import type { Command } from "@notale/editor/browser";
export interface EquationItem {
  id: string;
  parent?: string;
  locked: boolean;
  html: string;
  attributes: Record<string, string>;
}
export interface EquationSource {
  documentId: string;
  slideId: string;
  item: EquationItem;
}
export function selectedEquation(objects: EquationItem[], selection: string[]) {
  let item =
    selection.length === 1
      ? objects.find((o) => o.id === selection[0])
      : undefined;
  const seen = new Set<string>();
  while (item && item.attributes["data-notale-tex"] === undefined) {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    item = objects.find((o) => o.id === item?.parent);
  }
  return item;
}
export function equationCommands(
  source: EquationSource,
  current: { documentId: string; slideId: string; item?: EquationItem },
  tex: string,
  display: boolean,
  html: string,
): Command[] {
  if (
    current.documentId !== source.documentId ||
    current.slideId !== source.slideId ||
    current.item?.id !== source.item.id
  )
    throw Error("公式或页面已切换，输入已保留");
  if (current.item.locked) throw Error("公式已锁定");
  if (current.item.html !== source.item.html)
    throw Error("公式已变化，输入已保留，请重新打开编辑");
  if (
    tex === source.item.attributes["data-notale-tex"] &&
    display === (source.item.attributes["data-notale-tex-display"] !== "0")
  )
    return [];
  const { slideId } = source,
    target = source.item.id,
    link = /<link[^>]*>/i.exec(current.item.html)?.[0] ?? "";
  return [
    { type: "element.content", slideId, target, html: link + html },
    {
      type: "element.patch",
      slideId,
      target,
      patch: {
        attributes: {
          "data-notale-tex": tex,
          "data-notale-tex-display": display ? "1" : "0",
        },
        ...(display !==
        (source.item.attributes["data-notale-tex-display"] !== "0")
          ? { style: { display: display ? "block" : "inline-block" } }
          : {}),
      },
    },
  ];
}
