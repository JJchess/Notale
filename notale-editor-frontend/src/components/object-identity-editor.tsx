"use client";
import { isComposingKey } from "../keyboard";

import { editorActions } from "../state/editor-session";
import { useEditorSelector } from "../state/use-editor-selector";
import { useAuthorDraft } from "../state/use-author-draft";
export function ObjectIdentityEditor() {
  const field = useEditorSelector((state) => state.nameField),
    form = useAuthorDraft(field, editorActions.saveObjectName);
  return (
    <>
      <label>
        对象名称
        <input
          id="object-name"
          value={form.draft}
          disabled={!field?.editable || form.pending}
          onChange={(event) => form.change(event.target.value)}
          onKeyDown={(event) => {
            if (isComposingKey(event.nativeEvent)) return;
            if (event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              void form.apply();
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              form.reset();
              event.currentTarget.blur();
            }
          }}
        />
      </label>
      <button
        id="save-object-name"
        disabled={!field?.editable || form.pending}
        onClick={() => void form.apply()}
      >
        保存名称
      </button>
      <p
        id="object-name-status"
        className="hint"
        role="status"
        hidden={!form.error}
      >
        {form.error}
      </p>
      <button
        id="hide-objects"
        disabled={!field?.editable}
        onClick={() =>
          void editorActions.hideObjects().catch(editorActions.reportError)
        }
      >
        隐藏所选对象
      </button>
      <button
        id="show-objects"
        disabled={!field?.editable}
        onClick={() =>
          void editorActions.showObjects().catch(editorActions.reportError)
        }
      >
        显示所选对象
      </button>
    </>
  );
}
