"use client";
import { isComposingKey } from "../keyboard";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  tableEditorState,
  tableActions,
  type TableModel,
} from "../state/table-editor";
import type { TableAction } from "../state/table-commands";
export function TableEditor() {
  const model = useSyncExternalStore(
    tableEditorState.subscribe,
    tableEditorState.getSnapshot,
    tableEditorState.getServerSnapshot,
  );
  return model ? <TableFields key={model.key} model={model} /> : null;
}
function TableFields({ model }: { model: TableModel }) {
  const cell = model.cells.find((c) => c.id === model.chosen),
    [text, setText] = useState(cell?.text ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const baseline = useRef(model),
    dirty = useRef(false),
    running = useRef(false);
  const [color, setColor] = useState("#eee7ff"),
    [align, setAlign] = useState("left"),
    [ink, setInk] = useState("#30253e"),
    [font, setFont] = useState(""),
    [mode, setMode] = useState("all"),
    [border, setBorder] = useState("#6638dc"),
    [width, setWidth] = useState("1");
  useEffect(() => {
    if (baseline.current.chosen !== model.chosen) {
      dirty.current = false;
      setError("");
    }
    if (!dirty.current) {
      baseline.current = model;
      setText(cell?.text ?? "");
    }
  }, [model]);
  async function run(action: TableAction) {
    if (running.current || (action.kind === "text" && action.value === cell?.text)) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await tableActions.submit(
        action.kind === "text" ? baseline.current : model,
        action,
      );
      if (action.kind === "text" || !dirty.current) {
        dirty.current = false;
        const next = tableEditorState.getSnapshot();
        if (next?.key === model.key) {
          baseline.current = next;
          setText(next.cells.find((c) => c.id === next.chosen)?.text ?? "");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  const editable = !!cell?.editable && model.area.picked.length === 1;
  return (
    <fieldset id="visual-table-panel" disabled={busy || model.locked}>
      <legend>表格</legend>
      <div
        id="table-cell-grid"
        role="group"
        aria-label="表格单元格"
        style={{
          gridTemplateColumns: `repeat(${model.columns}, minmax(85px, 1fr))`,
        }}
      >
        {model.cells.map((c) => (
          <button
            key={c.id}
            data-table-cell={c.id}
            aria-label={`第 ${c.row + 1} 行，第 ${c.column + 1} 列：${c.text || "空白"}`}
            aria-pressed={model.area.picked.some((p) => p.id === c.id)}
            style={{
              gridArea: `${c.row + 1} / ${c.column + 1} / span ${c.rowSpan} / span ${c.colSpan}`,
            }}
            onClick={(e) => tableActions.choose(c.id, e.shiftKey)}
          >
            {c.text || "空白"}
          </button>
        ))}
      </div>
      <label>
        单元格文字
        <textarea
          id="table-cell-text"
          rows={3}
          disabled={!editable}
          value={text}
          onChange={(e) => {
            dirty.current = true;
            setText(e.target.value);
            setError("");
          }}
          onKeyDown={(event) => {
            if (isComposingKey(event.nativeEvent) || running.current) return;
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              dirty.current = false;
              baseline.current = model;
              setText(cell?.text ?? "");
              setError("");
            } else if (
              event.key === "Enter" &&
              (event.ctrlKey || event.metaKey)
            ) {
              event.preventDefault();
              event.stopPropagation();
              void run({ kind: "text", value: text });
            }
          }}
        />
      </label>
      <button
        id="save-table-cell"
        disabled={!editable || text === cell?.text}
        onClick={() => void run({ kind: "text", value: text })}
      >
        保存单元格
      </button>
      <div className="inline" id="visual-table-actions">
        {(
          [
            ["insert-row", "在上方插入行"],
            ["delete-row", "删除所在行"],
            ["insert-column", "在左侧插入列"],
            ["delete-column", "删除所在列"],
            ["unmerge", "拆分单元格"],
          ] as const
        ).map(([action, label]) => (
          <button
            key={action}
            data-table-action={action}
            disabled={
              action === "unmerge" && cell?.rowSpan === 1 && cell.colSpan === 1
            }
            onClick={() => void run({ kind: "structure", action })}
          >
            {label}
          </button>
        ))}
      </div>
      <div id="table-range-actions">
        <button
          id="merge-table-range"
          disabled={!model.area.valid || model.area.picked.length < 2}
          onClick={() => void run({ kind: "structure", action: "merge" })}
        >
          合并选区
        </button>
        <label>
          底色
          <input
            id="table-range-color"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </label>
        <button
          id="apply-table-color"
          onClick={() =>
            void run({
              kind: "style",
              property: "background-color",
              value: color,
            })
          }
        >
          应用底色
        </button>
        <label>
          对齐
          <select
            id="table-range-align"
            value={align}
            onChange={(e) => setAlign(e.target.value)}
          >
            <option value="left">左对齐</option>
            <option value="center">居中</option>
            <option value="right">右对齐</option>
          </select>
        </label>
        <button
          id="apply-table-align"
          onClick={() =>
            void run({ kind: "style", property: "text-align", value: align })
          }
        >
          应用对齐
        </button>
        <label>
          文字颜色
          <input
            id="table-text-color"
            type="color"
            value={ink}
            onChange={(e) => setInk(e.target.value)}
          />
        </label>
        <button
          id="apply-table-text-color"
          onClick={() =>
            void run({ kind: "style", property: "color", value: ink })
          }
        >
          应用文字颜色
        </button>
        <label>
          字号
          <input
            id="table-font-size"
            type="number"
            min="1"
            max="512"
            placeholder="清空以沿用原稿"
            value={font}
            onChange={(e) => setFont(e.target.value)}
          />
        </label>
        <button
          id="apply-table-font-size"
          onClick={() => void run({ kind: "font", value: font })}
        >
          应用字号
        </button>
        <label>
          边框范围
          <select
            id="table-border-mode"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="all">所有边框</option>
            <option value="outer">选区外框</option>
            <option value="none">无边框</option>
          </select>
        </label>
        <label>
          边框颜色
          <input
            id="table-border-color"
            type="color"
            value={border}
            onChange={(e) => setBorder(e.target.value)}
          />
        </label>
        <label>
          边框粗细
          <input
            id="table-border-width"
            type="number"
            min="0"
            max="30"
            step="0.5"
            value={width}
            onChange={(e) => setWidth(e.target.value)}
          />
        </label>
        <button
          id="apply-table-border"
          onClick={() =>
            void run({ kind: "border", mode, width, color: border })
          }
        >
          应用边框
        </button>
      </div>
      <p id="table-cell-status" role="status">
        {error ||
          (model.area.picked.length > 1
            ? `选中 ${model.area.picked.length} 个单元格`
            : editable
              ? `第 ${cell!.row + 1} 行 · 第 ${cell!.column + 1} 列`
              : "此单元格包含格式、子对象或锁定内容，请在画布中选择具体内容编辑。")}
      </p>
    </fieldset>
  );
}
