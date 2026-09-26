const unitScale: Record<string, number> = {
  px: 1,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  pt: 96 / 72,
  pc: 16,
};
function absoluteLength(source: string | null) {
  const match =
    /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(px|in|cm|mm|pt|pc)?$/i.exec(
      source?.trim() ?? "",
    );
  if (!match) return undefined;
  const value = Number(match[1]) * unitScale[match[2]?.toLowerCase() ?? "px"];
  return Number.isFinite(value) && value > 0 ? value : undefined;
}
/** Resolve intrinsic SVG size before placing it in the slide's pixel coordinate space. */
export function svgDimensions(
  widthSource: string | null,
  heightSource: string | null,
  viewBox: string | null,
) {
  const box = (viewBox ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const validViewBox =
    box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0;
  let width = absoluteLength(widthSource),
    height = absoluteLength(heightSource);
  if (validViewBox) {
    if (width === undefined && height !== undefined)
      width = (height * box[2]) / box[3];
    if (height === undefined && width !== undefined)
      height = (width * box[3]) / box[2];
    width ??= box[2];
    height ??= box[3];
  }
  return {
    width: width && Number.isFinite(width) ? width : 600,
    height: height && Number.isFinite(height) ? height : 400,
    validViewBox,
  };
}
