export const typographyFields = [
  "font-family",
  "font-size",
  "color",
  "line-height",
  "letter-spacing",
  "text-align",
  "writing-mode",
];
const dimensions = ["font-size", "line-height", "letter-spacing"];
export function typographyStyle(
  field: string,
  value: string,
): Record<string, string> {
  if (!typographyFields.includes(field)) throw Error("不支持的文字属性");
  if (
    value &&
    dimensions.includes(field) &&
    (!Number.isFinite(Number(value)) ||
      ((field === "font-size" || field === "line-height") &&
        Number(value) <= 0))
  )
    throw Error("请检查字号、行高和字距的输入值");
  const formatted =
    value && dimensions.includes(field) ? Number(value) + "px" : value;
  return {
    [field]: formatted,
    ...(field === "writing-mode"
      ? {
          "text-orientation": formatted.startsWith("vertical")
            ? "upright"
            : "mixed",
        }
      : {}),
  };
}
export function typographyDisplay(property: string, value: string) {
  if (property === "color") {
    const numbers = value.match(/^rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/);
    return numbers
      ? "#" +
          numbers
            .slice(1, 4)
            .map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0"))
            .join("")
      : value;
  }
  if (dimensions.includes(property)) {
    const number = parseFloat(value);
    return Number.isFinite(number) ? String(number) : "";
  }
  return value;
}
export function typographySnapshot(
  ids: string[],
  styles: Record<string, Record<string, string>>,
) {
  const fields = Object.fromEntries(
    typographyFields.map((field) => {
      const values = ids.map((id) => styles[id]?.[field] ?? ""),
        mixed = values.some((value) => value !== values[0]);
      return [
        field,
        {
          value: mixed ? "" : typographyDisplay(field, values[0] ?? ""),
          mixed,
        },
      ];
    }),
  );
  const pressed = (property: string) => {
    const values = ids.map((id) => styles[id]?.[property]),
      active = values.map((value) =>
        property === "font-weight"
          ? Number(value) >= 600 || value === "bold"
          : value === "italic" || value === "oblique",
      );
    return active.some((value) => value !== active[0])
      ? "mixed"
      : String(!!active[0]);
  };
  return {
    fields,
    mixed: Object.values(fields).some((field) => field.mixed),
    bold: pressed("font-weight"),
    italic: pressed("font-style"),
  };
}

/** Human-readable first family; the full CSS stack remains the edit baseline. */
export function fontFamilyLabel(value: string): string {
  const match = /^(?:"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)'|([^,]+))/.exec(
    value.trim(),
  );
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? value)
    .trim()
    .replace(/\\(["'\\])/g, "$1");
}

/** Keep editor-managed box sizing coherent when logical axes change. */
export function typographyObjectStyle(
  style: Record<string, string>,
  authored: Record<string, string>,
): Record<string, string> {
  if (
    !("writing-mode" in style) ||
    !authored.width ||
    !authored.height ||
    (!authored["inline-size"] && !authored["block-size"])
  )
    return style;
  const mode = style["writing-mode"];
  if (!mode)
    return authored["inline-size"] === "max-content" &&
      authored["block-size"] === "auto"
      ? {
          ...style,
          width: "",
          height: "",
          "inline-size": "max-content",
          "block-size": "auto",
        }
      : { ...style, "inline-size": "", "block-size": "" };
  const vertical = /^(vertical|sideways)/.test(mode);
  if (
    authored["inline-size"] === "max-content" &&
    authored["block-size"] === "auto"
  )
    return {
      ...style,
      width: vertical ? "auto" : "max-content",
      height: vertical ? "max-content" : "auto",
      "inline-size": "max-content",
      "block-size": "auto",
    };
  return {
    ...style,
    "inline-size": vertical ? authored.height : authored.width,
    "block-size": vertical ? authored.width : authored.height,
  };
}
