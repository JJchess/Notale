"use client";
import { isComposingKey } from "../keyboard";

import { editorActions } from "../state/editor-session";
import { useEditorSelector } from "../state/use-editor-selector";
import { useAuthorDraft } from "../state/use-author-draft";
export function BindingEditor() {
  const field = useEditorSelector((state) => state.bindingField),
    form = useAuthorDraft(field, editorActions.saveBinding);
  const keyboard = (
    event: import("react").KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    if (isComposingKey(event.nativeEvent)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      form.reset();
    } else if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      void form.apply();
    }
  };
  return (
    <>
      <label hidden={!field}>
        默认值
        {field?.checkbox ? (
          <select
            id="binding-value"
            onKeyDown={keyboard}
            value={form.draft}
            disabled={!field.editable || form.pending}
            onChange={(event) => form.change(event.target.value)}
          >
            <option value="true">选中</option>
            <option value="false">未选中</option>
          </select>
        ) : (
          <input
            id="binding-value"
            onKeyDown={keyboard}
            placeholder="选择滑块、输入框或下拉框"
            value={form.draft}
            disabled={!field?.editable || form.pending}
            onChange={(event) => form.change(event.target.value)}
          />
        )}
      </label>
      <button
        id="save-binding"
        hidden={!field}
        disabled={!field?.editable || form.pending}
        onClick={() => void form.apply()}
      >
        保存互动默认值
      </button>
      <p
        id="binding-status"
        className="hint"
        role="status"
        hidden={!form.error}
      >
        {form.error}
      </p>
    </>
  );
}
