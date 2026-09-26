"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import { layout } from "../../lib/start/pixel-font";

const WORD = "notale", QUIET = 2; // "no" is drawn quieter than "tale", like opencode's open|code
export interface WordmarkHandle { letters(): SVGGraphicsElement[] }

/** The start page's wordmark, drawn from the block font. The `o` is a button: poking it is the
 * egg (what the egg does is the caller's). */
export const PixelWordmark = forwardRef<WordmarkHandle, { onPoke?: (letter: SVGGraphicsElement) => void }>(function PixelWordmark({ onPoke }, ref) {
  const shape = useMemo(() => layout(WORD), []);
  const groups = useRef<(SVGGElement | null)[]>([]);
  useImperativeHandle(ref, () => ({ letters: () => groups.current.filter((g): g is SVGGElement => !!g) }), []);
  const o = shape.letters.findIndex(letter => letter.char === "o");
  const box = shape.letters[o]!;
  const pct = (value: number, of: number) => `${(value / of) * 100}%`;
  return (
    <div className="wordmark">
      <svg viewBox={`0 0 ${shape.width} ${shape.height}`} role="img" aria-label="Notale" shapeRendering="crispEdges">
        {shape.letters.map((_letter, index) => (
          <g key={index} ref={node => { groups.current[index] = node; }} className={"wordmark-letter" + (index < QUIET ? " is-quiet" : "")}>
            {shape.cells.filter(cell => cell.letter === index).map(cell => <rect key={`${cell.x}-${cell.y}`} x={cell.x} y={cell.y} width={1.02} height={1.02} className={cell.tone === "recess" ? "is-recess" : undefined} />)}
          </g>
        ))}
      </svg>
      {onPoke && <button type="button" className="wordmark-poke" aria-label="戳一下 o" title="戳一下"
        style={{ left: pct(box.x, shape.width), top: pct(box.y, shape.height), width: pct(box.width, shape.width), height: pct(box.height, shape.height) }}
        onClick={() => { const g = groups.current[o]; if (g) onPoke(g); }} />}
    </div>
  );
});
