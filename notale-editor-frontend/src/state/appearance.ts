export type AppearanceObject = {
  id: string;
  parent?: string;
  tag: string;
  locked: boolean;
  style: Record<string, string>;
  attributes: Record<string, string>;
};
export type Style = Record<string, string>;
export const SHADOWS: Record<
  string,
  [label: string, css: string, svg: string]
> = {
  none: ["无阴影", "none", "none"],
  soft: [
    "柔和",
    "0 2px 8px rgba(20,38,48,.14)",
    "drop-shadow(0 2px 6px rgba(20,38,48,.24))",
  ],
  medium: [
    "中等",
    "0 6px 18px rgba(20,38,48,.18)",
    "drop-shadow(0 5px 12px rgba(20,38,48,.3))",
  ],
  strong: [
    "强烈",
    "0 14px 34px rgba(20,38,48,.28)",
    "drop-shadow(0 10px 22px rgba(20,38,48,.38))",
  ],
};
export function toHex(color: string | undefined) {
  if (!color) return undefined;
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(color))
    return ("#" + [...color.slice(1)].map((c) => c + c).join("")).toLowerCase();
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
  return m
    ? "#" +
        m
          .slice(1, 4)
          .map((n) => Number(n).toString(16).padStart(2, "0"))
          .join("")
    : undefined;
}
export const paintless = (v: string | undefined) =>
  !v ||
  v === "none" ||
  v === "transparent" ||
  /rgba\(0,\s*0,\s*0,\s*0\)/.test(v);
export const isVector = (o: AppearanceObject) =>
  o.tag === "svg" ||
  !!o.attributes["data-notale-shape"] ||
  !!o.attributes["data-notale-icon"];
export function appearancePatch(
  o: AppearanceObject,
  field: string,
  fields: Record<string, string | boolean>,
  rect?: { width: number; height: number },
): Style {
  const value = (id: string) => String(fields[id] ?? "");
  const checked = (id: string) => fields[id] === true;
  // Text box sizing mirrors PowerPoint's autofit choices: keep the box, follow the
  // text's height, or hug the text in both directions.
  if (field === "fit") {
    const mode = value("appearance-fit");
    const vertical = /^(vertical|sideways)/.test(
      value("appearance-writing-mode") || o.style["writing-mode"] || "",
    );
    const width =
      mode === "both"
        ? vertical
          ? "auto"
          : "max-content"
        : rect
          ? `${Math.round(rect.width)}px`
          : (o.style.width ?? "600px");
    const height =
      mode === "both"
        ? vertical
          ? "max-content"
          : "auto"
        : mode === "height"
          ? "auto"
          : rect
            ? `${Math.round(rect.height)}px`
            : (o.style.height ?? "auto");
    return {
      width,
      height,
      "inline-size": vertical ? height : width,
      "block-size": vertical ? width : height,
    };
  }

  const svg = isVector(o),
    fill = value("appearance-fill"),
    stroke = value("appearance-stroke");
  if (field === "fill" || field === "gradient") {
    if (svg) return { fill: checked("appearance-fill-none") ? "none" : fill };
    const flat = checked("appearance-fill-none") ? "transparent" : fill;
    const gradient =
      checked("appearance-gradient") && !checked("appearance-fill-none")
        ? `linear-gradient(${value("appearance-gradient-angle")}deg, ${fill}, ${value("appearance-gradient-color")})`
        : "none";
    return { "background-color": flat, "background-image": gradient };
  }
  if (field === "stroke") {
    const none = checked("appearance-stroke-none"),
      width = value("appearance-stroke-width") || "0";
    if (svg)
      return {
        stroke: none ? "none" : stroke,
        "stroke-width": none ? "0" : width,
      };
    return none
      ? { border: "none" }
      : {
          "border-style":
            value("appearance-stroke-style") &&
            value("appearance-stroke-style") !== "none"
              ? value("appearance-stroke-style")
              : "solid",
          "border-color": stroke,
          "border-width": `${width}px`,
        };
  }
  if (field === "radius")
    return { "border-radius": `${value("appearance-radius") || 0}px` };
  if (field === "opacity")
    return { opacity: String(Number(value("appearance-opacity")) / 100) };
  if (field === "shadow") {
    const preset = SHADOWS[value("appearance-shadow")];
    if (!preset) return {};
    return svg ? { filter: preset[2] } : { "box-shadow": preset[1] };
  }
  if (field === "accent") return { "--accent": value("appearance-accent") };
  return {};
}

export function appearanceFields(
  css: Style,
  o: AppearanceObject,
): Record<string, string | boolean> {
  const fields: Record<string, string | boolean> = {
    "appearance-gradient-angle": "90",
    "appearance-gradient-color": "#28a69b",
  };
  const set = (id: string, value: unknown) => {
    fields[id] = String(value);
  };
  const svg = isVector(o);
  const paint = svg ? css.fill : css["background-color"];
  fields["appearance-fill-none"] = paintless(paint);
  set("appearance-fill", toHex(paint) ?? "#dee8ff");
  set("appearance-fill-raw", paint ?? "");
  const image = css["background-image"] ?? css.background ?? "";
  const gradient = /linear-gradient\(([^,]+)?/.exec(image);
  fields["appearance-gradient"] = !svg && image.includes("linear-gradient");
  if (gradient) {
    const angle = /(-?\d+(?:\.\d+)?)deg/.exec(image);
    if (angle) set("appearance-gradient-angle", Math.round(Number(angle[1])));
    const stops = [...image.matchAll(/rgba?\([^)]+\)|#[0-9a-f]{3,8}/gi)].map(
      (m) => m[0],
    );
    if (stops.length) {
      set("appearance-gradient-color", toHex(stops.at(-1)) ?? "#28a69b");
      set("appearance-gradient-color-raw", stops.at(-1));
    }
  }
  set("appearance-stroke-style", css["border-style"] ?? "solid");
  const line = svg ? css.stroke : (css["border-color"] ?? css.border);
  const width =
    parseFloat(
      svg
        ? (css["stroke-width"] ?? "0")
        : (css["border-width"] ?? css.border ?? "0"),
    ) || 0;
  fields["appearance-stroke-none"] = paintless(line) || width === 0;
  set("appearance-stroke", toHex(line) ?? "#466ddb");
  set("appearance-stroke-raw", (svg ? css.stroke : css["border-color"]) ?? "");
  set("appearance-stroke-width", width || (svg ? 3 : 1));
  set(
    "appearance-radius",
    Math.round(parseFloat(css["border-radius"] ?? "0") || 0),
  );
  const shadow = svg ? css.filter : css["box-shadow"];
  const preset = Object.entries(SHADOWS).find(
    ([, [, cssValue, svgValue]]) => (svg ? svgValue : cssValue) === shadow,
  );
  set(
    "appearance-shadow",
    paintless(shadow) ? "none" : (preset?.[0] ?? "custom"),
  );
  set(
    "appearance-opacity",
    Math.round(
      Number.isFinite(Number(css.opacity)) ? Number(css.opacity) * 100 : 100,
    ),
  );
  set(
    "appearance-accent",
    toHex(o.style["--accent"]) ??
      toHex(css["--accent"] ?? (isVector(o) ? css.stroke : css.color)) ??
      "#466ddb",
  );
  const vertical = /^(vertical|sideways)/.test(
    css["writing-mode"] ?? o.style["writing-mode"] ?? "",
  );
  set(
    "appearance-writing-mode",
    css["writing-mode"] ?? o.style["writing-mode"] ?? "horizontal-tb",
  );
  const authoredWidth = o.style.width ?? "",
    authoredHeight = o.style.height ?? "";
  set(
    "appearance-fit",
    (o.style["inline-size"] === "max-content" &&
      o.style["block-size"] === "auto") ||
      (vertical ? authoredHeight : authoredWidth).includes("max-content")
      ? "both"
      : !authoredHeight || authoredHeight === "auto"
        ? "height"
        : "fixed",
  );
  return fields;
}

export function appearanceSelection(
  targets: AppearanceObject[],
  computed: Record<string, Style> = {},
) {
  const objectFields = Object.fromEntries(
    targets.map((o) => [o.id, appearanceFields(computed[o.id] ?? o.style, o)]),
  );
  const fields = objectFields[targets[0]?.id] ?? {};
  const mixed = Object.keys(fields).filter((key) =>
    targets.some((o) => objectFields[o.id][key] !== fields[key]),
  );
  for (const id of [
    "appearance-fill",
    "appearance-stroke",
    "appearance-gradient-color",
  ]) {
    if (mixed.includes(id + "-raw") && !mixed.includes(id)) mixed.push(id);
  }
  return { fields, objectFields, mixed };
}
export function appearanceEditFields(
  base: Record<string, string | boolean>,
  incoming: Record<string, string | boolean>,
  changed: string,
) {
  const next = { ...base, [changed]: incoming[changed] };
  // Native color fields display RGB only. Untouched paint retains its original CSS alpha.
  for (const id of [
    "appearance-fill",
    "appearance-stroke",
    "appearance-gradient-color",
  ]) {
    const raw = base[id + "-raw"];
    if (
      changed !== id &&
      typeof raw === "string" &&
      raw &&
      (id === "appearance-gradient-color" || !paintless(raw))
    )
      next[id] = raw;
  }
  if (changed === "appearance-fill" || changed === "appearance-gradient")
    next["appearance-fill-none"] = false;
  if (changed === "appearance-stroke" || changed === "appearance-stroke-width")
    next["appearance-stroke-none"] = false;
  return next;
}
