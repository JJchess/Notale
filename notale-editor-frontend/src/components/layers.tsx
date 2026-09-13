"use client";
import { isComposingKey } from "../keyboard";

import { memo, useLayoutEffect, useRef, useState } from "react";
import { editorSession, editorActions } from "../state/editor-session";
import type { NameFieldState } from "../state/inspector";
import type { LayerRow, LayerState } from "../state/layers";
import { useEditorSelector } from "../state/use-editor-selector";
function LayerName({
  field,
  label,
  done,
}: {
  field: NameFieldState;
  label: string;
  done: (restore: boolean) => void;
}) {
  const initial = field.value || label;
  const [value, setValue] = useState(initial),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    running = useRef(false),
    cancelled = useRef(false);
  useLayoutEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const save = async (restore = true) => {
    if (running.current || cancelled.current) return;
    if (value === initial) {
      done(restore);
      return;
    }
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await editorActions.saveObjectName(field, value);
      done(restore);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="layer-name-edit">
      <input
        ref={input}
        aria-label="图层名称"
        value={value}
        disabled={busy}
        placeholder={label}
        onChange={(event) => {
          setValue(event.target.value);
          setError("");
        }}
        onBlur={() => void save(false)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (isComposingKey(event.nativeEvent)) return;
          if (event.key === "Enter") {
            event.preventDefault();
            void save();
          } else if (event.key === "Escape") {
            event.preventDefault();
            cancelled.current = true;
            done(true);
          }
        }}
      />
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
const LayerButton = memo(function LayerButton({
  row,
  source,
  selected,
}: {
  row: LayerRow;
  source: Pick<LayerState, "documentId" | "pageId">;
  selected: boolean;
}) {
  const [renaming, setRenaming] = useState<NameFieldState>();
  const button = useRef<HTMLButtonElement>(null),
    restore = useRef(false);
  useLayoutEffect(() => {
    if (!renaming && restore.current) {
      restore.current = false;
      button.current?.focus();
    }
  }, [renaming]);
  const rename = () => {
    if (row.locked) return;
    editorActions.selectLayer(source, row.id, false);
    const field = editorSession.getSnapshot().nameField;
    if (
      field?.editable &&
      field.targets.length === 1 &&
      field.targets[0] === row.id
    )
      setRenaming(field);
  };
  if (renaming)
    return (
      <LayerName
        field={renaming}
        label={row.label}
        done={(focus) => {
          restore.current = focus;
          setRenaming(undefined);
        }}
      />
    );
  return (
    <button
      ref={button}
      onDoubleClick={rename}
      onKeyDown={(event) => {
        if (
          event.key === "F2" &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
        ) {
          event.preventDefault();
          event.stopPropagation();
          rename();
        }
      }}
      className={"object-row" + (selected ? " selected" : "")}
      data-object={row.id}
      style={{ paddingLeft: 8 + row.depth * 8 }}
      title={row.title}
      aria-pressed={selected}
      onClick={(event) =>
        editorActions.selectLayer(
          source,
          row.id,
          event.shiftKey || event.ctrlKey || event.metaKey,
        )
      }
    >
      <svg className="layer-kind-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {/^(h[1-6]|p|span|text|tspan|a|label)$/i.test(row.tag) ? <path d="M5 5h14M12 5v14M8 19h8"/> : /^(img|image|video)$/i.test(row.tag) ? <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1"/><path d="m3 17 6-5 4 3 3-2 5 4"/></> : /^(g|div|main|section)$/i.test(row.tag) ? <><rect x="4" y="4" width="16" height="16" rx="2" strokeDasharray="3 3"/></> : <rect x="5" y="5" width="14" height="14" rx="2"/>}
      </svg>
      <span className="layer-label">{row.label}</span>
      {row.locked && <svg className="layer-lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" role="img" aria-label="已锁定"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>}
    </button>
  );
});
export function Layers() {
  const list = useRef<HTMLDivElement>(null);
  const source = useEditorSelector((state) => state.layers),
    query = useEditorSelector((state) => state.objectQuery),
    selected = useEditorSelector((state) => state.selectedIds);
  const search = query.trim().toLocaleLowerCase(),
    ids = new Set(selected),
    rows =
      source?.rows.filter((row) => !search || row.search.includes(search)) ??
      [];
  return (
    <>
      <label>
        查找对象
        <input
          id="object-search"
          type="search"
          autoComplete="off"
          onKeyDown={(event) => {
            if (isComposingKey(event.nativeEvent)) return;
            if (event.key === "Escape" && query) {
              event.preventDefault();
              event.stopPropagation();
              editorSession.update({ objectQuery: "" });
            } else if (
              (event.key === "Enter" || event.key === "ArrowDown") &&
              source &&
              rows.length
            ) {
              event.preventDefault();
              event.stopPropagation();
              editorActions.selectLayer(source, rows[0].id, false);
              list.current
                ?.querySelector<HTMLButtonElement>("button[data-object]")
                ?.focus();
            }
          }}
          placeholder="名称、文字或类型"
          value={query}
          onChange={(event) =>
            editorSession.update({ objectQuery: event.target.value })
          }
        />
      </label>
      <div
        id="objects"
        ref={list}
        onKeyDown={(event) => {
          if (
            event.ctrlKey ||
            event.metaKey ||
            event.altKey ||
            event.shiftKey ||
            !["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)
          )
            return;
          if (event.target instanceof HTMLInputElement) return;
          const target = (
            event.target as HTMLElement
          ).closest<HTMLButtonElement>("button[data-object]");
          if (!target || !source) return;
          const index = rows.findIndex(
            (row) => row.id === target.dataset.object,
          );
          if (index < 0) return;
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? rows.length - 1
                : Math.max(
                    0,
                    Math.min(
                      rows.length - 1,
                      index + (event.key === "ArrowUp" ? -1 : 1),
                    ),
                  );
          event.preventDefault();
          event.stopPropagation();
          editorActions.selectLayer(source, rows[next].id, false);
          event.currentTarget
            .querySelectorAll<HTMLButtonElement>("button[data-object]")
            [next]?.focus();
        }}
      >
        {source &&
          rows.map((row) => (
            <LayerButton
              key={JSON.stringify([source.documentId, source.pageId, row.id])}
              row={row}
              source={source}
              selected={ids.has(row.id)}
            />
          ))}
      </div>
      {source && rows.length === 0 && (
        <p className="hint" role="status">
          {search ? "没有匹配的对象" : "此页暂无可编辑对象"}
        </p>
      )}
    </>
  );
}
