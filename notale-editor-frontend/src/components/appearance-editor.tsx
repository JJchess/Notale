"use client";
import { isComposingKey } from "../keyboard";

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  appearanceState,
  type AppearanceModel,
} from "../state/appearance-editor";
import { SHADOWS } from "../state/appearance";
import { PropertyGesture } from "../state/property-gesture";
export function AppearanceEditor() {
  const model = useSyncExternalStore(
    appearanceState.subscribe,
    appearanceState.getSnapshot,
    appearanceState.getServerSnapshot,
  );
  return model ? <AppearanceFields key={model.key} model={model} /> : null;
}
function AppearanceFields({ model }: { model: AppearanceModel }) {
  const [mixed, setMixed] = useState(model.mixed);
  const [fields, setFields] = useState(model.fields);
  const current = useRef(fields),
    latest = useRef(model),
    focused = useRef(false);
  latest.current = model;
  useLayoutEffect(() => {
    if (!focused.current && model.captured) {
      current.current = model.fields;
      setFields(model.fields);
      setMixed(model.mixed);
    }
  }, [model.fields, model.mixed, model.captured]);
  function update(id: string, value: string | boolean) {
    setMixed((values) =>
      values.filter(
        (key) =>
          key !== id &&
          !(
            (id === "appearance-fill" || id === "appearance-gradient") &&
            key === "appearance-fill-none"
          ) &&
          !(
            id === "appearance-stroke-width" && key === "appearance-stroke-none"
          ) &&
          !(id === "appearance-stroke" && key === "appearance-stroke-none"),
      ),
    );
    const next = { ...current.current, [id]: value };
    if (id === "appearance-fill" || id === "appearance-gradient")
      next["appearance-fill-none"] = false;
    if (id === "appearance-stroke" || id === "appearance-stroke-width")
      next["appearance-stroke-none"] = false;
    current.current = next;
    setFields(next);
    return next;
  }
  const input = (
    id: string,
    field: string,
    type: string,
    min?: number,
    max?: number,
    step?: number,
    disabled = false,
  ) => (
    <PaintInput
      key={id}
      id={id}
      type={type}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      mixed={mixed.includes(id)}
      onRestoreMixed={(value) =>
        setMixed((keys) =>
          value
            ? [...new Set([...keys, id])]
            : keys.filter((key) => key !== id),
        )
      }
      value={String(fields[id] ?? "")}
      model={model}
      onValue={(v) => update(id, v)}
      read={() => latest.current.commands(field, current.current, id)}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        if (latest.current.captured) {
          current.current = latest.current.fields;
          setFields(latest.current.fields);
          setMixed(latest.current.mixed);
        }
      }}
    />
  );
  const toggle = (id: string, field: string, label: string) => (
    <label className="paint-none">
      <input
        id={id}
        type="checkbox"
        ref={(node) => {
          if (node) node.indeterminate = mixed.includes(id);
        }}
        aria-checked={mixed.includes(id) ? "mixed" : !!fields[id]}
        checked={!!fields[id]}
        onChange={(e) => {
          const next = update(id, e.target.checked);
          void model.transactions
            .commit(
              id + ":" + crypto.randomUUID(),
              model.commands(field, next, id),
            )
            .catch(model.transactions.error);
        }}
      />
      {label}
    </label>
  );
  const select = (id: string, field: string, options: [string, string][]) => (
    <select
      id={id}
      value={mixed.includes(id) ? "" : String(fields[id] ?? "")}
      onChange={(e) => {
        const next = update(id, e.target.value);
        void model.transactions
          .commit(
            id + ":" + crypto.randomUUID(),
            model.commands(field, next, id),
          )
          .catch(model.transactions.error);
      }}
    >
      {mixed.includes(id) && (
        <option value="" disabled>
          多种值
        </option>
      )}
      {options.map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
  const flat =
    (!mixed.includes("appearance-fill-none") &&
      !!fields["appearance-fill-none"]) ||
    (!mixed.includes("appearance-gradient") && !fields["appearance-gradient"]);
  return (
    <fieldset
      id="property-appearance"
      aria-busy={!model.captured}
      className="property-group"
      disabled={model.locked}
    >
      <legend>外观</legend>
      <div className="paint-row">
        {toggle("appearance-fill-none", "fill", "无填充")}
        <label className={fields["appearance-fill-none"] ? "paint-off" : ""}>
          填充{input("appearance-fill", "fill", "color")}
        </label>
      </div>
      <div
        className="paint-row"
        id="appearance-gradient-row"
        hidden={!model.html}
      >
        {toggle("appearance-gradient", "gradient", "渐变")}
        <label>
          渐变终点
          {input(
            "appearance-gradient-color",
            "gradient",
            "color",
            undefined,
            undefined,
            undefined,
            flat,
          )}
        </label>
        <label>
          角度
          {input(
            "appearance-gradient-angle",
            "gradient",
            "number",
            0,
            360,
            15,
            flat,
          )}
        </label>
      </div>
      <div className="paint-row">
        {toggle("appearance-stroke-none", "stroke", "无描边")}
        <label>描边{input("appearance-stroke", "stroke", "color")}</label>
        <label>
          粗细{input("appearance-stroke-width", "stroke", "number", 0, 80, 0.5)}
        </label>
      </div>
      <div className="field-grid">
        <label id="appearance-radius-field" hidden={!model.html}>
          圆角{input("appearance-radius", "radius", "number", 0, 400, 1)}
        </label>
        <label>
          阴影
          {select("appearance-shadow", "shadow", [
            ...Object.entries(SHADOWS).map(
              ([key, [label]]) => [key, label] as [string, string],
            ),
            ["custom", "自定义"],
          ])}
        </label>
      </div>
      <label className="appearance-opacity">
        不透明度{input("appearance-opacity", "opacity", "range", 0, 100, 1)}
        <output id="appearance-opacity-value">
          {mixed.includes("appearance-opacity")
            ? "—"
            : fields["appearance-opacity"] + "%"}
        </output>
      </label>
      <label id="appearance-accent-field" hidden={!model.accent}>
        主色（联动整组配色）{input("appearance-accent", "accent", "color")}
      </label>
      <label id="appearance-fit-field" hidden={!model.fit}>
        文字框大小
        {select("appearance-fit", "fit", [
          ["fixed", "固定尺寸"],
          ["height", "高度随文字"],
          ["both", "宽高随文字"],
        ])}
      </label>
    </fieldset>
  );
}
export function PaintInput(props: {
  id: string;
  type: string;
  mixed?: boolean;
  onRestoreMixed?: (value: boolean) => void;
  min?: number;
  max?: number;
  step?: number | string;
  disabled: boolean;
  value: string;
  model: Pick<AppearanceModel, "key" | "transactions">;
  onValue: (value: string) => unknown;
  read: () => import("@notale/editor/browser").Command[];
  onFocus: () => void;
  onBlur: () => void;
}) {
  const node = useRef<HTMLInputElement>(null),
    latest = useRef(props),
    gesture = useRef<PropertyGesture | undefined>(undefined),
    initialMixed = useRef(!!props.mixed),
    initial = useRef(props.value),
    valueRef = useRef(props.value),
    keyboard = useRef(false),
    editing = useRef(false);
  latest.current = props;
  const finish = () => {
    keyboard.current = false;
    const active = gesture.current;
    if (!active?.pending) return;
    initial.current = valueRef.current;
    initialMixed.current = false;
    void active.finish().catch(latest.current.model.transactions.error);
  };
  const cancel = () => {
    const result = gesture.current?.cancel();
    keyboard.current = false;
    const restored = result?.value ?? initial.current;
    initial.current = restored;
    valueRef.current = restored;
    latest.current.onValue(restored);
    latest.current.onRestoreMixed?.(initialMixed.current);
    if (result) void result.done.catch(latest.current.model.transactions.error);
  };
  useLayoutEffect(() => {
    const active = new PropertyGesture(props.id, props.model.transactions);
    gesture.current = active;
    initial.current = latest.current.value;
    // React normalizes change to every input. Native change is only the browser's
    // completion signal (notably the system color picker), never a field-value store.
    const input = node.current!;
    const complete = () => {
      queueMicrotask(() => {
        if (
          gesture.current === active &&
          !keyboard.current &&
          input.validity.valid
        )
          finish();
      });
    };
    input.addEventListener("change", complete);
    return () => {
      input.removeEventListener("change", complete);
      gesture.current = undefined;
      keyboard.current = false;
      void active.finish().catch(props.model.transactions.error);
    };
  }, [props.id, props.model.key]);
  useLayoutEffect(() => {
    if (!gesture.current?.pending && !editing.current) {
      initial.current = props.value;
      initialMixed.current = !!props.mixed;
      valueRef.current = props.value;
    }
  }, [props.value, props.mixed]);
  return (
    <input
      ref={node}
      id={props.id}
      type={props.type}
      min={props.min}
      max={props.max}
      step={props.step}
      disabled={props.disabled}
      data-mixed={props.mixed || undefined}
      title={props.mixed ? "多种值" : undefined}
      placeholder={props.mixed ? "—" : undefined}
      aria-valuetext={props.mixed ? "多种值" : undefined}
      value={props.mixed && props.type === "number" ? "" : props.value}
      onChange={(event) => {
        const value = event.currentTarget.value;
        valueRef.current = value;
        props.onValue(value);
        if (!event.currentTarget.validity.valid) return;
        try {
          gesture.current?.update(props.read(), initial.current);
        } catch (error) {
          props.model.transactions.error(error);
        }
      }}
      onFocus={() => {
        editing.current = true;
        if (!gesture.current?.pending) {
          initial.current = props.value;
          initialMixed.current = !!props.mixed;
        }
        props.onFocus();
      }}
      onBlur={(event) => {
        if (event.currentTarget.validity.valid) finish();
        else cancel();
        editing.current = false;
        props.onBlur();
      }}
      onKeyDown={(event) => {
        if (isComposingKey(event.nativeEvent)) return;
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          cancel();
        } else if (
          [
            "ArrowUp",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight",
            "PageUp",
            "PageDown",
          ].includes(event.key)
        )
          keyboard.current = true;
        else if (event.key === "Enter") {
          event.preventDefault();
          if (event.currentTarget.validity.valid) finish();
        }
      }}
      onKeyUp={() => {
        if (keyboard.current) finish();
      }}
      onPointerCancel={cancel}
    />
  );
}
