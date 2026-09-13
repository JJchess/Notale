"use client";
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
  const pending = useRef(false),
    [busy, setBusy] = useState(false);
  return (
    <button
      id={id}
      title={title}
      aria-label={title}
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
      {action === "preview" ? (
        <>
          <AnimationIcon name="play" /> 预览所选
        </>
      ) : action === "stop" ? (
        <AnimationIcon name="stop" />
      ) : (
        label
      )}
    </button>
  );
}
export function AnimationHeading() {
  const source = useControls();
  return (
    <>
      <div className="animation-topline">
        <strong id="animation-target">{source.target}</strong>
        <Action
          source={source}
          action="newDraft"
          id="new-animation"
          label="＋ 添加动画"
          title="为所选对象另加一条动画"
          disabled={!source.enabled}
        />
      </div>
      <label id="animation-sequence-field" hidden={!source.multiple}>
        多个对象
        <select
          id="animation-sequence"
          value={source.sequence}
          onChange={(event) => setAnimationSequence(event.target.value)}
        >
          <option value="together">同时播放</option>
          <option value="after">依次播放</option>
          <option value="click">逐次单击</option>
        </select>
      </label>
    </>
  );
}
export function AnimationPreviewControls() {
  const source = useControls();
  return (
    <div className="animation-preview-actions">
      <Action
        source={source}
        action="preview"
        id="preview-selected-animation"
        label="▷ 预览所选"
        disabled={!source.previewable}
      />
      <Action
        source={source}
        action="stop"
        id="stop-animation-preview"
        label="■"
        title="停止预览"
      />
      <Action
        source={source}
        action="present"
        id="preview-animation"
        label="播放整页"
      />
    </div>
  );
}
export function AnimationEditingStatus() {
  const source = useControls();
  return <p id="animation-editing">{source.status}</p>;
}
