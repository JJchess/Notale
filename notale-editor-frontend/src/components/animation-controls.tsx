"use client";
import {useI18n} from '../i18n/react';

import { AnimationIcon } from "./animation-icon";
import { useRef, useState, useSyncExternalStore } from "react";
import {
  animationControlsState,
  setAnimationSequence,
  runAnimationControl,
  type AnimationControlsModel,
} from "../state/animation-controls";
function useControls() {
  return useSyncExternalStore(
    animationControlsState.subscribe,
    animationControlsState.getSnapshot,
    animationControlsState.getServerSnapshot,
  );
}
function Action({
  source,
  action,
  id,
  label,
  title,
  disabled,
}: {
  source: AnimationControlsModel;
  action: "newDraft" | "preview" | "stop" | "present";
  id: string;
  label: string;
  title?: string;
  disabled?: boolean;
}) {
 const t=useI18n();

  const pending = useRef(false),
    [busy, setBusy] = useState(false);
  return (
    <button
      id={id}
      title={title ?? t(label)}
      aria-label={title ?? t(label)}
      disabled={disabled || busy}
      onClick={async () => {
        if (pending.current) return;
        pending.current = true;
        setBusy(true);
        try {
          await runAnimationControl(source, action);
        } finally {
          pending.current = false;
          setBusy(false);
        }
      }}
    >
      <AnimationIcon name={action === "newDraft" ? "plus" : action === "preview" ? "play" : action === "stop" ? "stop" : "present"} />
    </button>
  );
}
export function AnimationHeading() {
 const t=useI18n();

  const source = useControls();
  return (
    <>
      <div className="animation-topline">
        <strong id="animation-target">{source.target}</strong>
        <Action
          source={source}
          action="newDraft"
          id="new-animation"
          label={t("＋ 添加动画")}
          title={t("为所选对象另加一条动画")}
          disabled={!source.enabled}
        />
      </div>
      <label id="animation-sequence-field" hidden={!source.multiple}>{t("多个对象")}<select
          id="animation-sequence"
          value={source.sequence}
          onChange={(event) => setAnimationSequence(event.target.value)}
        >
          <option value="together">{t("同时播放")}</option>
          <option value="after">{t("依次播放")}</option>
          <option value="click">{t("逐次单击")}</option>
        </select>
      </label>
    </>
  );
}
export function AnimationPreviewControls() {
 const t=useI18n();

  const source = useControls();
  return (
    <div className="animation-preview-actions">
      <Action
        source={source}
        action="preview"
        id="preview-selected-animation"
        label={t("▷ 预览所选")}
        disabled={!source.previewable}
      />
      <Action
        source={source}
        action="stop"
        id="stop-animation-preview"
        label="■"
        title={t("停止预览")}
      />
      <Action
        source={source}
        action="present"
        id="preview-animation"
        label={t("播放整页")}
      />
    </div>
  );
}
export function AnimationEditingStatus() {
 const t=useI18n();

  const source = useControls();
  return source.status ? <p id="animation-editing">{t(source.status)}</p> : null;
}
