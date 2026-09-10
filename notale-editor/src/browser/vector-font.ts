// Font outlines are computed in the same disposable worker as boolean geometry.
// @ts-ignore fontkit exposes an untyped browser build.
import { create } from 'fontkit';
import svgpath from 'svgpath';
export function outlineText(
  bytes: Uint8Array,
  text: string,
  size: number,
  x: number,
  y: number,
  spacing = 0,
  anchor = 'start',
) {
  const font = create(bytes);
  if (!font.layout) throw Error('请选择单一字体文件');
  const run = font.layout(text),
    scale = size / font.unitsPerEm;
  if (run.glyphs.some((g: any) => g.id === 0))
    throw Error('字体缺少所需字符，请选择包含这些字符的字体');
  const width =
    run.positions.reduce((sum: number, p: any) => sum + p.xAdvance * scale + spacing, 0) - spacing;
  let pen = x - (anchor === 'middle' ? width / 2 : anchor === 'end' ? width : 0);
  return run.glyphs
    .map((g: any, i: number) => {
      const pos = run.positions[i],
        d = svgpath(g.path.toSVG())
          .matrix([scale, 0, 0, -scale, pen + pos.xOffset * scale, y - pos.yOffset * scale])
          .toString();
      pen += pos.xAdvance * scale + spacing;
      return d;
    })
    .join(' ');
}
