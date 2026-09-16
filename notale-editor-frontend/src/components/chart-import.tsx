"use client";
import { isComposingKey } from "../keyboard";

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  chartImportState,
  applyChartImport,
  closeChartImport,
  type ChartImport,
} from "../state/chart-import-dialog";
export function ChartImportDialog() {
  const source = useSyncExternalStore(
    chartImportState.subscribe,
    chartImportState.getSnapshot,
    chartImportState.getServerSnapshot,
  );
  return source ? <ImportForm key={source.id} source={source} /> : null;
}
function ImportForm({ source }: { source: ChartImport }) {
  const [text, setText] = useState(source.text),
    [header, setHeader] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    running = useRef(false);
  useLayoutEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => node.close();
  }, []);
  const close = () => {
    if (!running.current) closeChartImport(source);
  };
  async function apply() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await applyChartImport(source, text, header);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="chart-import-dialog"
      aria-label="导入图表数据"
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (
          event.key === "Enter" &&
          (event.ctrlKey || event.metaKey) &&
          !isComposingKey(event.nativeEvent) &&
          text.trim()
        ) {
          event.preventDefault();
          void apply();
        }
      }}
    >
      <h2>导入表格</h2>
      <textarea
        autoFocus
        rows={8}
        aria-label="表格内容"
        value={text}
        disabled={busy}
        onChange={(event) => setText(event.target.value)}
      />
      <label>
        <input
          type="checkbox"
          checked={header}
          disabled={busy}
          onChange={(event) => setHeader(event.target.checked)}
        />
        首行为系列名称
      </label>
      <p role="status" hidden={!error}>
        {error}
      </p>
      <button disabled={busy || !text.trim()} onClick={() => void apply()}>
        导入
      </button>
      <button disabled={busy} onClick={close}>
        取消
      </button>
    </dialog>
  );
}
