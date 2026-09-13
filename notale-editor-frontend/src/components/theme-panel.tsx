"use client";
import { ThemeSettingsButton } from "./document-settings";
import { isComposingKey } from "../keyboard";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAuthorDraft } from "../state/use-author-draft";
import {
  TOKENS,
  PRESETS,
  FONTS,
  themePanelState,
  themePanelActions,
  type ThemeModel,
} from "../state/theme-panel";
export function ThemePanel() {
  const source = useSyncExternalStore(
    themePanelState.subscribe,
    themePanelState.getSnapshot,
    themePanelState.getServerSnapshot,
  );
  return source ? <ThemeFields key={source.key} source={source} /> : null;
}
function ThemeFields({ source }: { source: ThemeModel }) {
  const form = useAuthorDraft(source, async (source, raw) => {
    const values = JSON.parse(raw) as Record<string, string>,
      patch: Record<string, string> = {};
    for (const key of new Set([
      ...Object.keys(source.theme),
      ...Object.keys(values),
    ]))
      if (values[key] !== source.theme[key]) patch[key] = values[key] ?? "";
    await themePanelActions.save(source, patch);
  });
  const attempted = useRef(""),
    fontBefore = useRef("");
  const [editingFont, setEditingFont] = useState(false);
  useEffect(() => {
    if (
      editingFont ||
      form.pending ||
      !form.draft ||
      form.draft === source.value ||
      form.draft === attempted.current
    )
      return;
    const timer = setTimeout(() => {
      attempted.current = form.draft;
      void form.apply();
    }, 150);
    return () => clearTimeout(timer);
  }, [form.draft, form.pending, source.value, editingFont]);
  const values: Record<string, string> = JSON.parse(form.draft || source.value);
  const change = (patch: Record<string, string>) => {
    const merged = { ...values, ...patch };
    for (const [key, value] of Object.entries(patch))
      if (!value) delete merged[key];
    const next = JSON.stringify(merged);
    attempted.current = "";
    if (next === source.value) form.reset();
    else form.change(next);
  };
  const active = PRESETS.findIndex((preset) =>
    TOKENS.every(
      (token) =>
        (values[token.key] ?? "").toLowerCase() ===
        preset.values[token.key].toLowerCase(),
    ),
  );
  return (
    <fieldset
      id="deck-theme"
      className="property-group"
      disabled={form.pending}
    >
      <legend>主题配色</legend>
      <div id="theme-presets" className="theme-presets">
        {PRESETS.map((preset, index) => (
          <button
            key={preset.name}
            type="button"
            data-theme-preset={index}
            title={"套用" + preset.name}
            aria-pressed={active === index}
            onClick={() => change(preset.values)}
          >
            <span className="theme-swatch">
              {TOKENS.slice(0, 4).map((token) => (
                <i
                  key={token.key}
                  style={{ background: preset.values[token.key] }}
                />
              ))}
            </span>
            {preset.name}
          </button>
        ))}
      </div>
      <div className="field-grid">
        {TOKENS.map((token) => (
          <label key={token.key}>
            {token.label}
            <input
              data-theme-token={token.key}
              type="color"
              value={values[token.key] ?? token.fallback}
              onChange={(e) => change({ [token.key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <label>
        字体
        <input
          id="theme-font"
          onFocus={() => {
            fontBefore.current = values["font-family"] ?? "";
            setEditingFont(true);
          }}
          onBlur={() => setEditingFont(false)}
          onKeyDown={(event) => {
            if (isComposingKey(event.nativeEvent)) return;
            if (event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.blur();
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              change({ "font-family": fontBefore.current });
              event.currentTarget.blur();
            }
          }}
          list="theme-fonts"
          placeholder="沿用页面字体"
          value={values["font-family"] ?? ""}
          onChange={(e) => change({ "font-family": e.target.value })}
        />
        <datalist id="theme-fonts">
          {FONTS.map((font) => (
            <option key={font} value={font} />
          ))}
        </datalist>
      </label>
      <div className="theme-advanced-action"><ThemeSettingsButton /></div>
      {form.error && (
        <>
          <p role="alert">{form.error}</p>
          <button onClick={() => void form.apply()}>重试保存</button>
          <button
            onClick={() => {
              attempted.current = "";
              form.reset();
            }}
          >
            载入当前主题
          </button>
        </>
      )}
    </fieldset>
  );
}
