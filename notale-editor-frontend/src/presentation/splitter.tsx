"use client";
import { isComposingKey } from "../keyboard";
import { useEffect, useRef } from "react";
import type { PointerEvent } from "react";
const clamp = (value: number) => Math.max(48, Math.min(76, value));
/** Layout gestures are local; only their completed value becomes a saved preference. */
export function PresenterSplitter({
  value,
  onChange,
  onCommit,
}: {
  value: number;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  const gesture = useRef<
    | {
        id: number;
        startX: number;
        start: number;
        width: number;
        next: number;
        node: HTMLDivElement;
      }
    | undefined
  >(undefined);
  const callbacks = useRef({ onChange, onCommit });
  callbacks.current = { onChange, onCommit };
  const raf = useRef(0);
  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      gesture.current = undefined;
    },
    [],
  );
  function finish(cancel = false) {
    const active = gesture.current;
    if (!active) return;
    gesture.current = undefined;
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    if (active.node.hasPointerCapture(active.id))
      active.node.releasePointerCapture(active.id);
    callbacks.current.onChange(cancel ? active.start : active.next);
    if (!cancel && active.next !== active.start)
      callbacks.current.onCommit(active.next);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const active = gesture.current;
    if (!active || event.pointerId !== active.id) return;
    active.next = clamp(
      active.start + ((event.clientX - active.startX) / active.width) * 100,
    );
    if (!raf.current)
      raf.current = requestAnimationFrame(() => {
        raf.current = 0;
        if (gesture.current === active) callbacks.current.onChange(active.next);
      });
  }
  return (
    <div
      className="ps-splitter"
      role="separator"
      aria-label="调整画面与备注宽度"
      aria-orientation="vertical"
      tabIndex={0}
      aria-valuenow={Math.round(value)}
      aria-valuemin={48}
      aria-valuemax={76}
      onPointerDown={(event) => {
        if (event.button !== 0 || gesture.current) return;
        event.preventDefault();
        event.currentTarget.focus();
        const width =
          event.currentTarget.parentElement!.getBoundingClientRect().width;
        if (!width) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        gesture.current = {
          id: event.pointerId,
          startX: event.clientX,
          start: value,
          width,
          next: value,
          node: event.currentTarget,
        };
      }}
      onPointerMove={move}
      onPointerUp={(event) => {
        if (gesture.current?.id === event.pointerId) {
          move(event);
          finish();
        }
      }}
      onPointerCancel={() => finish(true)}
      onLostPointerCapture={() => finish(true)}
      onDoubleClick={() => {
        onChange(66);
        onCommit(66);
      }}
      onKeyDown={(event) => {
        if(isComposingKey(event.nativeEvent))return;
        if (event.key === "Escape" && gesture.current) {
          event.preventDefault();
          event.stopPropagation();
          finish(true);
          return;
        }
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        event.stopPropagation();
        if (gesture.current) return;
        const next =
          event.key === "Home"
            ? 48
            : event.key === "End"
              ? 76
              : clamp(
                  value +
                    (event.key === "ArrowLeft" ? -1 : 1) *
                      (event.shiftKey ? 10 : 2),
                );
        onChange(next);
        if (next !== value) onCommit(next);
      }}
    />
  );
}
