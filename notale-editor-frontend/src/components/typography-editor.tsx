"use client";
import { isComposingKey } from "../keyboard";

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  typographyState,
  typographyReset,
  type TypographyModel,
} from "../state/typography-editor";
import {
  typographyFields,
  typographyStyle,
  fontFamilyLabel,
} from "../state/typography";
import { PaintInput } from "./appearance-editor";
export function TypographyEditor() {
  const model = useSyncExternalStore(
    typographyState.subscribe,
    typographyState.getSnapshot,
    typographyState.getServerSnapshot,
  );
  return model ? <TypographyFields key={model.key} model={model} /> : null;
}
function TypographyFields({ model }: { model: TypographyModel }) {
  const values = () =>
    Object.fromEntries(
      typographyFields.map((id) => [id, model.snapshot.fields[id].value]),
    );
  const [fields, setFields] = useState(values),
    [error, setError] = useState("");
  const current = useRef(fields),
    focus = useRef(""),
    fontDirty = useRef(false),
    latest = useRef(model);
  latest.current = model;
  useLayoutEffect(() => {
    if (!model.captured) return;
    const next = { ...current.current };
    for (const id of typographyFields)
      if (focus.current !== id) next[id] = model.snapshot.fields[id].value;
    current.current = next;
    setFields(next);
  }, [model.snapshot, model.captured]);
  const change = (id: string, value: string) => {
    current.current = { ...current.current, [id]: value };
    setFields(current.current);
  };
  const read = (id: string) =>
    latest.current.commands(typographyStyle(id, current.current[id]));
  async function save(style: Record<string, string>) {
    setError("");
    try {
      await model.transactions.commit(
        "typography:" + crypto.randomUUID(),
        model.commands(style),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  const numeric = (id: string, type = "number", min?: number) => (
    <PaintInput
      id={id}
      type={type}
      min={min}
      step={type === "number" ? "any" : undefined}
      disabled={false}
      mixed={model.snapshot.fields[id].mixed && !fields[id]}
      onRestoreMixed={(mixed) => {
        if (mixed) change(id, "");
      }}
      value={fields[id] || (type === "color" ? "#263449" : "")}
      model={model}
      onValue={(v) => change(id, v)}
      read={() => read(id)}
      onFocus={() => {
        focus.current = id;
      }}
      onBlur={() => {
        focus.current = "";
        if (latest.current.captured)
          change(id, latest.current.snapshot.fields[id].value);
      }}
    />
  );
  const select = (id: string, options: [string, string][]) => (
    <select
      id={id}
      value={fields[id]}
      onChange={(e) => {
        change(id, e.target.value);
        void save(typographyStyle(id, e.target.value));
      }}
    >
      <option value="">多种值</option>
      {options.map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
  return (
    <>
      <div className="field-grid typography-fields">
        <label>字号{numeric("font-size", "number", 1)}</label>
        <label>文字颜色{numeric("color", "color")}</label>
        <label className="full-field">
          字体
          <input
            id="font-family"
            list="font-families"
            placeholder={
              model.snapshot.fields["font-family"].mixed
                ? "多种字体"
                : "沿用页面字体"
            }
            title={latest.current.snapshot.fields["font-family"].value}
            value={
              fontDirty.current
                ? fields["font-family"]
                : fontFamilyLabel(fields["font-family"])
            }
            onFocus={() => {
              focus.current = "font-family";
            }}
            onChange={(e) => {
              fontDirty.current = true;
              change("font-family", e.target.value);
            }}
            onBlur={() => {
              focus.current = "";
              if (fontDirty.current) {
                fontDirty.current = false;
                const previous =
                  latest.current.snapshot.fields["font-family"].value;
                const typed = current.current["font-family"];
                const value =
                  typed === fontFamilyLabel(previous) ? previous : typed;
                change("font-family", value);
                if (value !== previous)
                  void save(typographyStyle("font-family", value));
              }
            }}
            onKeyDown={(e) => {
              if (isComposingKey(e.nativeEvent)) return;
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                fontDirty.current = false;
                change(
                  "font-family",
                  latest.current.snapshot.fields["font-family"].value,
                );
                e.currentTarget.blur();
              } else if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
          />
          <datalist id="font-families">
            {[
              "system-ui",
              "Arial",
              "Georgia",
              "Microsoft YaHei",
              "PingFang SC",
            ].map((font) => (
              <option key={font} value={font} />
            ))}
          </datalist>
        </label>
        <label>行高 px{numeric("line-height", "number", 1)}</label>
        <label>字距 px{numeric("letter-spacing")}</label>
        <label>
          段落对齐
          {select("text-align", [
            ["start", "起始端"],
            ["left", "左对齐"],
            ["center", "居中"],
            ["right", "右对齐"],
            ["justify", "两端对齐"],
            ["end", "末尾端"],
          ])}
        </label>
        <label>
          文字方向
          {select("writing-mode", [
            ["horizontal-tb", "横排"],
            ["vertical-rl", "竖排 · 从右到左"],
            ["vertical-lr", "竖排 · 从左到右"],
          ])}
        </label>
      </div>
      <div className="inline">
        <button
          id="bold"
          className="typography-icon"
          aria-label="加粗"
          title="加粗"
          aria-pressed={model.snapshot.bold as "true" | "false" | "mixed"}
          onClick={() =>
            void save({
              "font-weight": model.snapshot.bold === "true" ? "400" : "700",
            })
          }
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M7 4h6a4 4 0 0 1 0 8H7zm0 8h7a4 4 0 0 1 0 8H7z" />
          </svg>
        </button>
        <button
          id="italic"
          className="typography-icon"
          aria-label="斜体"
          title="斜体"
          aria-pressed={model.snapshot.italic as "true" | "false" | "mixed"}
          onClick={() =>
            void save({
              "font-style":
                model.snapshot.italic === "true" ? "normal" : "italic",
            })
          }
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M10 4h9M5 20h9M15 4 9 20" />
          </svg>
        </button>
      </div>
      <p
        id="typography-status"
        className="hint"
        role="status"
        hidden={!error && !model.status}
      >
        {error || model.status}
      </p>
      <button
        id="reset-typography"
        onClick={() => void save(typographyReset())}
      >
        恢复页面文字样式
      </button>
    </>
  );
}
