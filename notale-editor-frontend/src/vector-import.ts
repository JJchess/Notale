/** Static SVG ingress. Identities and stylesheet selectors are private to this instance. */
export function prepareSvgImport(source: string, x = 120, y = 160) {
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  if (
    doc.querySelector("parsererror") ||
    doc.documentElement.localName !== "svg"
  )
    throw Error("SVG 文件无法解析");
  const svg = doc.documentElement,
    idMap = new Map<string, string>();
  for (const n of [svg, ...svg.querySelectorAll("*")]) {
    if (
      [
        "script",
        "foreignObject",
        "iframe",
        "object",
        "embed",
        "animate",
        "animateTransform",
        "set",
      ].includes(n.localName)
    ) {
      n.remove();
      continue;
    }
    n.setAttribute("data-notale-id", crypto.randomUUID());
    if (n.id) {
      const id = "svg_" + crypto.randomUUID().replaceAll("-", "");
      idMap.set(n.id, id);
      n.id = id;
    }
    for (const a of [...n.attributes])
      if (
        /^on/i.test(a.name) ||
        /javascript\s*:|data:text\/html/i.test(a.value)
      )
        n.removeAttribute(a.name);
  }
  if (!svg.id) svg.id = "svg_" + crypto.randomUUID().replaceAll("-", "");
  const rewrite = (s: string) =>
    s.replace(
      /url\(\s*(['"]?)#([^\s)'"]+)\1\s*\)/g,
      (_all, q, id) => `url(#${idMap.get(id) ?? id})`,
    );
  for (const n of [svg, ...svg.querySelectorAll("*")])
    for (const a of [...n.attributes]) {
      let value = rewrite(a.value);
      if (["href", "xlink:href"].includes(a.name) && value.startsWith("#"))
        value = "#" + (idMap.get(value.slice(1)) ?? value.slice(1));
      n.setAttribute(a.name, value);
    }
  for (const style of svg.querySelectorAll("style")) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(rewrite(style.textContent ?? ""));
    const scope = (rules: CSSRuleList): string =>
      [...rules]
        .map((rule) => {
          if (rule instanceof CSSImportRule) return "";
          if (rule instanceof CSSStyleRule) {
            const selector = rule.selectorText.replace(
              /#([\w-]+)/g,
              (_all, id) => "#" + (idMap.get(id) ?? id),
            );
            return (
              selector
                .split(",")
                .flatMap((s) => {
                  s = s.trim();
                  return [
                    `#${svg.id} ${s}`,
                    ...(s === `#${svg.id}`
                      ? [s]
                      : s.startsWith("svg")
                        ? [`#${svg.id}${s.slice(3)}`]
                        : /^[.[:]/.test(s)
                          ? [`#${svg.id}${s}`]
                          : []),
                  ];
                })
                .join(",") +
              "{" +
              rule.style.cssText +
              "}"
            );
          }
          if ("cssRules" in rule)
            return (
              rule.cssText.slice(0, rule.cssText.indexOf("{") + 1) +
              scope((rule as CSSGroupingRule).cssRules) +
              "}"
            );
          return "";
        })
        .join("\n");
    style.textContent = scope(sheet.cssRules);
  }
  const vb = (svg.getAttribute("viewBox") ?? "")
      .trim()
      .split(/[ ,]+/)
      .map(Number),
    width = parseFloat(svg.getAttribute("width") ?? "") || vb[2] || 600,
    height = parseFloat(svg.getAttribute("height") ?? "") || vb[3] || 400;
  if (vb.length !== 4 || !vb.every(Number.isFinite))
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const scale = Math.min(1, 800 / width, 600 / height);
  svg.setAttribute("width", String(width * scale));
  svg.setAttribute("height", String(height * scale));
  svg.setAttribute(
    "style",
    `${svg.getAttribute("style") ?? ""};position:absolute;left:${x}px;top:${y}px;width:${width * scale}px;height:${height * scale}px`,
  );
  svg.setAttribute("data-notale-name", "矢量图");
  return new XMLSerializer().serializeToString(svg);
}
