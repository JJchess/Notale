"use client";
import { isComposingKey } from "../keyboard";

import { useSyncExternalStore } from "react";
import { tableEditorState } from "../state/table-editor";
import { richEditorState } from "../state/rich-editor";
import { editorActions } from "../state/editor-session";
import { useEditorSelector } from "../state/use-editor-selector";
import { useAuthorDraft } from "../state/use-author-draft";
export function ObjectTextEditor() {
  const field = useEditorSelector((state) => state.textField),
    form = useAuthorDraft(field, editorActions.replaceText);
  const rich = useSyncExternalStore(
    richEditorState.subscribe,
    richEditorState.getSnapshot,
    richEditorState.getServerSnapshot,
  );
  const table = useSyncExternalStore(
    tableEditorState.subscribe,
    tableEditorState.getSnapshot,
    tableEditorState.getServerSnapshot,
  );
  if (rich.available || table?.cells.some((cell) => cell.id === field?.target))
    return null;
  return (
    <>
      <label hidden={!field}>
        内容
        <textarea
          id="object-text"
          rows={3}
          value={form.draft}
          disabled={!field?.editable || form.pending}
          onChange={(event) => form.change(event.target.value)}
          onKeyDown={(event) => {
            if (isComposingKey(event.nativeEvent)) return;
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              form.reset();
            } else if (
              event.key === "Enter" &&
              (event.ctrlKey || event.metaKey)
            ) {
              event.preventDefault();
              event.stopPropagation();
              void form.apply();
            }
          }}
        />
      </label>
      <button
        id="apply-text"
        hidden={!field}
        disabled={!field?.editable || form.pending}
        onClick={() => void form.apply()}
      >
        应用文字
      </button>
      <p
        id="object-text-status"
        className="hint"
        role="status"
        hidden={!form.error}
      >
        {form.error}
      </p>
    </>
  );
}
