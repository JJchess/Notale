/** Move root decoration onto text runs so native range editing can remove it. */
export function materializeRootDecoration(root: HTMLElement): boolean {
  const css = getComputedStyle(root);
  if (!/underline|line-through/.test(css.textDecorationLine)) return false;
  const selection = root.ownerDocument.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
  const endpoints =
    range && root.contains(range.commonAncestorContainer)
      ? ([
          range.startContainer,
          range.startOffset,
          range.endContainer,
          range.endOffset,
        ] as const)
      : undefined;
  const walker = root.ownerDocument.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
  );
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  for (const text of texts) {
    if (!text.data) continue;
    const span = root.ownerDocument.createElement("span");
    span.style.textDecoration = css.textDecoration;
    text.replaceWith(span);
    span.append(text);
  }
  root.style.textDecoration = "none";
  if (endpoints && selection) {
    const restored = root.ownerDocument.createRange();
    restored.setStart(endpoints[0], endpoints[1]);
    restored.setEnd(endpoints[2], endpoints[3]);
    selection.removeAllRanges();
    selection.addRange(restored);
  }
  return true;
}
