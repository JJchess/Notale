"use client";
import { isComposingKey } from "../keyboard";

import { useState, useSyncExternalStore } from "react";
import { notesState, notesActions } from "../state/notes-editor";

export function NotesEditor() {
  const model = useSyncExternalStore(
    notesState.subscribe,
    notesState.getSnapshot,
    notesState.getServerSnapshot,
  );
  const [failure, setFailure] = useState<{ key: string; message: string }>();
  const run = (action: () => Promise<unknown>) => {
    const key = model?.key ?? "";
    setFailure(undefined);
    void action().catch((cause) =>
      setFailure({
        key,
        message: cause instanceof Error ? cause.message : String(cause),
      }),
    );
  };
  const save = () => {
    if (model?.dirty && !model.busy) run(() => notesActions.save(model));
  };
  const error =
    model?.error || (failure?.key === model?.key ? failure?.message : "");
  return (
    <>
      <label>
        演讲者备注
        <textarea
          id="notes"
          rows={3}
          maxLength={100000}
          placeholder="这页要讲什么？"
          value={model?.value ?? ""}
          disabled={!model}
          onChange={(event) => {
            if (model) {
              setFailure(undefined);
              notesActions.edit(model, event.target.value);
            }
          }}
          onCompositionStart={() => { if (model) notesActions.composing(model, true); }}
          onCompositionEnd={() => { if (model) notesActions.composing(model, false); }}
          onKeyDown={(event) => {
            if (
              !isComposingKey(event.nativeEvent) &&
              event.key === "Enter" &&
              (event.ctrlKey || event.metaKey)
            ) {
              event.preventDefault();
              event.stopPropagation();
              save();
            }
          }}
        />
      </label>
      <button
        id="save-notes"
        title="保存备注 · Ctrl / ⌘ + Enter"
        disabled={!model || !model.dirty || model.busy}
        onClick={save}
      >
        {model?.busy ? "保存中…" : model?.dirty ? "立即保存" : "自动保存"}
      </button>
      <button
        id="speaker"
        disabled={!model}
        onClick={() => run(notesActions.present)}
      >
        演讲者模式 ↗
      </button>
      {model?.conflict !== undefined && (
        <div>
          <p>已保存的备注：</p>
          <pre>{model.conflict || "（空）"}</pre>
          <button
            disabled={model.busy}
            onClick={() => run(() => notesActions.resolve(model, true))}
          >
            保留我的备注
          </button>
          <button
            disabled={model.busy}
            onClick={() => run(() => notesActions.resolve(model, false))}
          >
            使用已保存备注
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  );
}
