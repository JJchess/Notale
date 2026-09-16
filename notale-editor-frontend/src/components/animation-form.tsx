"use client";
import { isComposingKey } from "../keyboard";

import { NumberField as NumericField } from "./ui/number-field";
import { AnimationPath } from "./animation-path";
import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import {
  animationFormState,
  animationTriggerLabels,
  type AnimationFormModel,
} from "../state/animation-form";
import { animationEffectLabels } from "../state/animation-gallery";
import type { AnimationField } from "../state/animation-draft";
export function AnimationForm() {
  const model = useSyncExternalStore(
    animationFormState.subscribe,
    animationFormState.getSnapshot,
    animationFormState.getServerSnapshot,
  );
  useSyncExternalStore(
    model.draft.subscribe,
    model.draft.getSnapshot,
    model.draft.getServerSnapshot,
  );
  useLayoutEffect(
    () => () => {
      model.draft.focus(undefined);
      model.draft.formFocused = false;
    },
    [model.draft, model.scope],
  );
  return (
    <fieldset
      onFocusCapture={(event) => {
        model.draft.formFocused = true;
        const id = (event.target as HTMLElement).id;
        if (model.draft.has(id)) model.draft.focus(id);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          model.draft.formFocused = false;
        if (model.draft.focused === (event.target as HTMLElement).id)
          model.draft.focus(undefined);
        const id = (event.target as HTMLElement).id;
        if (model.draft.has(id) && id !== "keyframes")
          queueMicrotask(model.refresh);
      }}
      id="animation-settings"
      disabled={model.disabled}
    >
      <legend className="sr-only">动画设置</legend>
      <Fields key={model.scope} model={model} />
      <details
        id="animation-path"
        hidden={model.draft.get("effect") !== "motion"}
      >
        <AnimationPath key={model.scope} disabled={model.disabled} />
      </details>
    </fieldset>
  );
}
function Fields({ model }: { model: AnimationFormModel }) {
  const keyframeFocus = useRef("");
  const cancelledKeyframes = useRef(false);
  const draft = model.draft,
    effect = draft.get("effect"),
    moving = ["fly-in", "fly-out", "float-in"].includes(effect);
  const select = (
    id: AnimationField,
    label: string,
    options: Record<string, string> | { value: string; label: string }[],
    hidden = false,
  ) => (
    <label hidden={hidden}>
      {label}
      <select
        id={id}
        value={draft.get(id)}
        onChange={(event) => {
          draft.set(id, event.target.value);
          model.change(id);
        }}
      >
        {(Array.isArray(options)
          ? options
          : Object.entries(options).map(([value, label]) => ({ value, label }))
        ).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      {select(
        "effect",
        "效果",
        {
          ...animationEffectLabels,
          custom: "自定义效果",
          "chart-state": "图表变化",
        },
        true,
      )}
      <div className="field-grid">
        {select("animation-step", "步骤", model.steps)}
        <NumberField
          model={model}
          id="duration"
          label="时长（秒）"
          min={0}
          max={60}
          step={0.05}
        />
        <NumberField
          model={model}
          id="delay"
          label="延迟（秒）"
          min={0}
          max={60}
          step={0.05}
        />
        <NumberField model={model} id="dx" label="水平位移" hidden={!moving} />
      </div>
      {select("trigger", "开始方式", animationTriggerLabels)}
      {select(
        "trigger-target",
        "触发对象",
        [{ value: "", label: "选择对象" }, ...model.targets],
        draft.get("trigger") !== "object",
      )}
      <NumberField model={model} id="dy" label="垂直位移" hidden={!moving} />
      {select(
        "effect-direction",
        "效果方向",
        { left: "从左侧", right: "从右侧", up: "从上方", down: "从下方" },
        ![
          "wipe-in",
          "wipe-out",
          "split-in",
          "split-out",
          "fly-in",
          "fly-out",
          "float-in",
        ].includes(effect),
      )}
      <details className="animation-advanced">
        <summary>更多效果选项</summary>
        {select("easing", "缓动", {
          "ease-out": "减速",
          linear: "线性",
          ease: "平滑",
          "ease-in": "加速",
          "ease-in-out": "加速后减速",
        })}
        <NumberField
          model={model}
          id="animation-repeat"
          label="重复次数"
          min={1}
          max={20}
          step={1}
        />
        <label className="animation-check">
          <input
            id="animation-reverse"
            type="checkbox"
            checked={draft.reverse}
            onChange={(event) => {
              draft.reverse = event.target.checked;
              model.change("animation-reverse");
            }}
          />
          自动反向
        </label>
      </details>
      <details id="animation-custom" hidden={effect !== "custom"}>
        <summary>自定义效果数据</summary>
        <label>
          关键帧
          <textarea
            id="keyframes"
            rows={4}
            value={draft.get("keyframes")}
            onChange={(event) => draft.set("keyframes", event.target.value)}
            onFocus={() => {
              keyframeFocus.current = draft.get("keyframes");
              cancelledKeyframes.current = false;
            }}
            onKeyDown={(event) => {
              if (isComposingKey(event.nativeEvent)) return;
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                cancelledKeyframes.current = true;
                draft.set("keyframes", keyframeFocus.current);
                event.currentTarget.blur();
              } else if (
                event.key === "Enter" &&
                (event.ctrlKey || event.metaKey)
              ) {
                event.preventDefault();
                event.stopPropagation();
                event.currentTarget.blur();
              }
            }}
            onBlur={() => {
              if (
                !cancelledKeyframes.current &&
                draft.get("keyframes") !== keyframeFocus.current
              )
                model.change("keyframes");
              cancelledKeyframes.current = false;
            }}
          />
        </label>
      </details>
    </>
  );
}
function NumberField({
  model,
  id,
  label,
  hidden,
  min,
  max,
  step = 1,
}: {
  model: AnimationFormModel;
  id: AnimationField;
  label: string;
  hidden?: boolean;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <NumericField
      integer={id === "animation-repeat"}
      id={id}
      label={label}
      hidden={hidden}
      disabled={model.disabled}
      min={min}
      max={max}
      step={step}
      value={model.draft.get(id)}
      onCommit={(value) => {
        model.draft.set(id, String(value));
        model.change(id);
      }}
    />
  );
}
