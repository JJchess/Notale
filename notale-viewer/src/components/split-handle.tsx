"use client";

import { useRef } from "react";

/** The seam between the lecture and the conversation. Drag it, or focus it and use ←/→ (Shift for
 * bigger steps); a double click puts it back. `value` is the conversation panel's width in px. */
export function SplitHandle({ value, min, max, onResize, onReset, onDragging, label }: {
  value: number; min: number; max: number;
  /** Called with a clientX while dragging, or with a width from the keyboard. */
  onResize: (input: { clientX: number } | { width: number }) => void;
  onReset: () => void;
  onDragging: (dragging: boolean) => void;
  label: string;
}) {
  const dragging = useRef(false);
  const end = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    onDragging(false);
  };
  return (
    <div className="split-handle" role="separator" aria-orientation="vertical" aria-label={label} tabIndex={0}
      aria-valuenow={Math.round(value)} aria-valuemin={Math.round(min)} aria-valuemax={Math.round(max)}
      onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); onDragging(true); }}
      onPointerMove={event => { if (dragging.current) onResize({ clientX: event.clientX }); }}
      onPointerUp={end} onPointerCancel={end}
      onDoubleClick={onReset}
      onKeyDown={event => {
        const step = event.shiftKey ? 64 : 16;
        // The handle moves left to give the conversation more room.
        if (event.key === "ArrowLeft") { event.preventDefault(); onResize({ width: value + step }); }
        else if (event.key === "ArrowRight") { event.preventDefault(); onResize({ width: value - step }); }
        else if (event.key === "Home") { event.preventDefault(); onResize({ width: max }); }
        else if (event.key === "End") { event.preventDefault(); onResize({ width: min }); }
      }} />
  );
}
