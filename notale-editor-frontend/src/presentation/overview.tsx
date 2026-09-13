"use client";
import { isComposingKey } from "../keyboard";
import { useLayoutEffect, useRef } from "react";
import type { PresentationController, PresentationView } from "./controller";
import { OverviewThumbnail } from "./stage";
import { ToolButton } from "./icons";

export function PresentationOverview({
  controller,
  slides,
  currentId,
  width,
  height,
}: {
  controller: PresentationController;
  slides: PresentationView["slides"];
  currentId?: string;
  width: number;
  height: number;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    cards = useRef<(HTMLButtonElement | null)[]>([]);
  useLayoutEffect(() => {
    const element = dialog.current!,
      previous = document.activeElement as HTMLElement | null;
    element.showModal();
    const selected =
      cards.current[slides.findIndex((slide) => slide.id === currentId)] ??
      cards.current[0];
    selected?.focus();
    selected?.scrollIntoView({ block: "nearest" });
    return () => {
      element.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="ps-overview"
      aria-label="选择要放映的页面"
      onCancel={(event) => {
        event.preventDefault();
        controller.overview();
      }}
      onKeyDown={(event) => {
        if(isComposingKey(event.nativeEvent))return;
        event.stopPropagation();
        const index = cards.current.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        if (index < 0) return;
        let next = index;
        if (event.key === "ArrowRight") next++;
        else if (event.key === "ArrowLeft") next--;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = slides.length - 1;
        else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          const columns = Math.max(
            1,
            cards.current.filter(
              (card) => card?.offsetTop === cards.current[0]?.offsetTop,
            ).length,
          );
          next += event.key === "ArrowDown" ? columns : -columns;
        } else return;
        event.preventDefault();
        cards.current[Math.max(0, Math.min(slides.length - 1, next))]?.focus();
      }}
    >
      <header>
        <h2>所有页面</h2>
        <ToolButton
          label="关闭页面总览 · Esc"
          icon="close"
          onClick={controller.overview}
        />
      </header>
      <div className="ps-overview-grid">
        {slides.map((slide, index) => (
          <button
            key={slide.id}
            ref={(element) => {
              cards.current[index] = element;
            }}
            className={
              "ps-overview-card " + (slide.id === currentId ? "is-current" : "")
            }
            aria-current={slide.id === currentId ? "page" : undefined}
            onClick={() => controller.jump(index)}
          >
            <OverviewThumbnail
              controller={controller}
              id={slide.id}
              width={width}
              height={height}
            />
            <span>
              <b>{index + 1}</b>
              {slide.name}
            </span>
          </button>
        ))}
      </div>
    </dialog>
  );
}
