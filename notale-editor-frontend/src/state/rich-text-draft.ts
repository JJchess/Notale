export type RichTextObject = {
  id: string;
  html: string;
  tag: string;
  locked: boolean;
};
const allowed = new Set([
  "b",
  "strong",
  "em",
  "i",
  "u",
  "s",
  "span",
  "br",
  "sub",
  "sup",
  "a",
  "p",
  "ul",
  "ol",
  "li",
]);
const formatting = new Set([
  "color",
  "background-color",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-decoration",
  "text-decoration-line",
  "line-height",
  "letter-spacing",
  "text-align",
  "vertical-align",
]);
export function richTextSource(object: RichTextObject) {
  const doc = new DOMParser().parseFromString(object.html, "text/html");
  const root = doc.body.firstElementChild;
  if (root?.hasAttribute("data-notale-authored-chart")) return;
  if (
    !root ||
    ![
      "p",
      "div",
      "section",
      "article",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "span",
      "li",
      "blockquote",
      "a",
    ].includes(object.tag)
  )
    return;
  if ([...root.querySelectorAll("*")].some((el) => !allowed.has(el.localName)))
    return;
  return root;
}

/** Owns authored attributes independently of the editable DOM surface. */
export function createRichTextDraft() {
  const originals = new Map<string, Element>();
  function cleanDraft(root: Element) {
    for (const node of root.querySelectorAll<HTMLElement>("*")) {
      const id = node.getAttribute("data-notale-id");
      if (id) originals.set(id, node.cloneNode(true) as Element);
      for (const attr of [...node.attributes])
        if (!["style", "data-notale-id", "href"].includes(attr.name))
          node.removeAttribute(attr.name);
      for (const property of [...node.style])
        if (!formatting.has(property)) node.style.removeProperty(property);
    }
  }
  function serialize(html: string) {
    const draft = document.createElement("div");
    draft.innerHTML = html;
    const usedIds = new Set<string>();
    for (const node of draft.querySelectorAll<HTMLElement>("*")) {
      if (!allowed.has(node.localName))
        throw new Error("请使用文字、段落和列表编辑内容");
      const id = node.getAttribute("data-notale-id"),
        original = id ? originals.get(id) : undefined;
      const styles = new Map(
        [...node.style]
          .filter((p) => formatting.has(p))
          .map((p) => [p, node.style.getPropertyValue(p)]),
      );
      for (const attr of [...node.attributes]) node.removeAttribute(attr.name);
      if (original)
        for (const attr of [...original.attributes])
          if (attr.name !== "style") node.setAttribute(attr.name, attr.value);
      // The optimistic projection and persisted document must share node identities.
      const stableId =
        original && id && !usedIds.has(id) ? id : crypto.randomUUID();
      node.setAttribute("data-notale-id", stableId);
      usedIds.add(stableId);
      if (original?.getAttribute("style"))
        node.setAttribute("style", original.getAttribute("style")!);
      for (const property of formatting) node.style.removeProperty(property);
      for (const [property, value] of styles)
        node.style.setProperty(property, value);
    }
    return draft.innerHTML;
  }
  return {
    prepare(root: Element) {
      originals.clear();
      cleanDraft(root);
      return root.innerHTML;
    },
    serialize,
    clear() {
      originals.clear();
    },
  };
}
