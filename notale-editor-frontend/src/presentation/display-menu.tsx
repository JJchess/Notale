"use client";
import {useI18n} from '../i18n/react';

import { isComposingKey } from "../keyboard";
import { useEffect, useRef } from "react";
import type { PresentationController } from "./controller";
import { Icon } from "./icons";

export function PresentationDisplayMenu({
  controller,
}: {
  controller: PresentationController;
}) {
 const t=useI18n();

  const menu = useRef<HTMLDetailsElement>(null);
  function close(restoreFocus = false) {
    if (!menu.current?.open) return;
    menu.current.open = false;
    if (restoreFocus) menu.current.querySelector("summary")?.focus();
  }
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target))
        close();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  function run(action: () => void) {
    close(true);
    action();
  }
  return (
    <details
      ref={menu}
      className="ps-display-menu"
      onKeyDown={(event) => {
        if(isComposingKey(event.nativeEvent))return;
        if (event.key === "Escape" && menu.current?.open) {
          event.preventDefault();
          event.stopPropagation();
          close(true);
        }
      }}
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          close();
      }}
    >
      <summary>
        <Icon name="monitor" />{t("显示选项")}<Icon name="chevron" size={14} />
      </summary>
      <div className="ps-menu">
        <button id="audience" onClick={() => run(controller.openAudience)}>
          <Icon name="monitor" />{t("打开观众窗口")}</button>
        <button id="fullscreen" onClick={() => run(controller.fullscreen)}>
          <Icon name="fullscreen" />{t("全屏当前窗口")}</button>
        <button onClick={() => run(controller.speaker)}>
          <Icon name="play" />{t("切换到放映视图")}</button>
        <button onClick={() => run(controller.enableSound)}>
          <Icon name="sound" />{t("启用本窗口声音")}</button>
      </div>
    </details>
  );
}
