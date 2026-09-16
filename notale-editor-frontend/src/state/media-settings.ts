import { mediaSettingsSchema } from "@notale/editor/browser";

type MediaSource = {
  tag: string;
  attributes: Record<string, string>;
  style: Record<string, string>;
};

// Only convert CSS that the percentage-based media model can represent exactly.
function percentage(value: string): number | undefined {
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)%$/.test(value) && value !== "0") return;
  const number = parseFloat(value);
  return number >= 0 && number <= 100 ? number : undefined;
}
function position(value: string) {
  let parts = value.trim().toLowerCase().split(/\s+/);
  if (parts.length === 1)
    parts = /^(top|bottom)$/.test(parts[0])
      ? ["center", parts[0]]
      : [parts[0], "center"];
  if (parts.length !== 2) return;
  if (/^(top|bottom)$/.test(parts[0]) || /^(left|right)$/.test(parts[1]))
    parts.reverse();
  const axis = (part: string, low: string, high: string) =>
    part === low
      ? 0
      : part === high
        ? 100
        : part === "center"
          ? 50
          : percentage(part);
  const positionX = axis(parts[0], "left", "right"),
    positionY = axis(parts[1], "top", "bottom");
  if (positionX !== undefined && positionY !== undefined)
    return { positionX, positionY };
}
function crop(value: string) {
  if (value.trim().toLowerCase() === "none")
    return { top: 0, right: 0, bottom: 0, left: 0 };
  const match = /^inset\(\s*([^()]+?)\s*\)$/i.exec(value.trim());
  if (!match) return;
  const values = match[1].split(/\s+/).map(percentage);
  if (
    values.length < 1 ||
    values.length > 4 ||
    values.some((v) => v === undefined)
  )
    return;
  const [top, right = top, bottom = top, left = right] = values as number[];
  if (top + bottom >= 100 || left + right >= 100) return;
  return { top, right, bottom, left };
}

/** Authored geometry is authoritative even when older media metadata has defaults. */
export function readMediaSettings(object: MediaSource) {
  const a = object.attributes;
  const metadata = a["data-notale-media"]
    ? JSON.parse(a["data-notale-media"])
    : {
        controls: object.tag === "img" || a.controls !== undefined,
        muted: a.muted !== undefined,
        loop: a.loop !== undefined,
      };
  const fit = object.style["object-fit"];
  const focus = position(object.style["object-position"] ?? "");
  const clipping = crop(object.style["clip-path"] ?? "");
  return mediaSettingsSchema.parse({
    ...metadata,
    ...(fit && /^(contain|cover|fill|none|scale-down)$/.test(fit)
      ? { fit }
      : {}),
    ...focus,
    ...(clipping ? { crop: clipping } : {}),
  });
}

export function mediaGeometryCapabilities(object: MediaSource) {
  const focus = object.style["object-position"]?.trim();
  const clipping = object.style["clip-path"]?.trim();
  return {
    position: !focus || !!position(focus),
    crop: !clipping || !!crop(clipping),
  };
}
