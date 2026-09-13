"use client";
import { isComposingKey } from "../keyboard";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  linkActions,
  linkEditorState,
  type LinkModel,
} from "../state/link-editor";
import { useEditorSelector } from "../state/use-editor-selector";
import { useAuthorDraft } from "../state/use-author-draft";
const useLink = () =>
  useSyncExternalStore(
    linkEditorState.subscribe,
    linkEditorState.getSnapshot,
    linkEditorState.getServerSnapshot,
  );
export function LinkInsertButton() {
  const loaded = useEditorSelector((state) => !!state.document);
  return (
    <button
      disabled={!loaded}
      id="open-link-insert"
      className="preset-card"
      type="button"
      onClick={linkActions.open}
    >
      链接与页面跳转
    </button>
  );
}
function LinkFields({
  model,
  onBusyChange,
}: {
  model: LinkModel;
  onBusyChange?: (busy: boolean) => void;
}) {
  const form = useAuthorDraft(model, linkActions.save),
    draft = form.draft
      ? JSON.parse(form.draft)
      : { kind: "page", pageId: "", url: "", label: "继续探索" },
    [removing, setRemoving] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    onBusyChange?.(form.pending || removing);
  }, [form.pending, removing, onBusyChange]);
  const change = (key: string, value: string) =>
    form.change(JSON.stringify({ ...draft, [key]: value }));
  return (
    <fieldset
      id="link-editor"
      onKeyDown={(event) => {
        if (
          event.key === "Enter" &&
          !isComposingKey(event.nativeEvent) &&
          event.target instanceof HTMLInputElement
        ) {
          event.preventDefault();
          event.stopPropagation();
          void form.apply();
        }
      }}
      disabled={form.pending || removing || model.locked}
    >
      <legend>链接与页面跳转</legend>
      <label>
        目标类型
        <select
          id="link-kind"
          value={draft.kind}
          onChange={(e) => change("kind", e.target.value)}
        >
          <option value="page">讲义中的页面</option>
          <option value="url">外部链接</option>
        </select>
      </label>
      <label id="link-page-label" hidden={draft.kind !== "page"}>
        跳转到
        <select
          id="link-page"
          value={draft.pageId}
          onChange={(e) => change("pageId", e.target.value)}
        >
          {!model.pages.some((page) => page.id === draft.pageId) && (
            <option value={draft.pageId} disabled>
              目标页面已不存在，请重新选择
            </option>
          )}
          {model.pages.map((page, index) => (
            <option key={page.id} value={page.id}>
              {index + 1} · {page.name}
            </option>
          ))}
        </select>
      </label>
      <label id="link-url-label" hidden={draft.kind !== "url"}>
        链接地址
        <input
          id="link-url"
          type="text"
          inputMode="url"
          autoComplete="url"
          placeholder="https://example.com"
          value={draft.url}
          onChange={(e) => change("url", e.target.value)}
        />
      </label>
      {model.creating ? (
        <>
          <label>
            新按钮文字
            <input
              id="link-label"
              value={draft.label}
              onChange={(e) => change("label", e.target.value)}
            />
          </label>
          <button
            id="insert-link"
            type="button"
            onClick={() => void form.apply()}
          >
            插入跳转按钮
          </button>
        </>
      ) : (
        <>
          <button
            id="update-link"
            type="button"
            onClick={() => void form.apply()}
          >
            更新所选链接地址
          </button>
          <button
            id="remove-link"
            type="button"
            onClick={async () => {
              setRemoving(true);
              setError("");
              try {
                await linkActions.remove(model);
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setRemoving(false);
              }
            }}
          >
            移除所选链接
          </button>
        </>
      )}
      <p
        id="link-status"
        className="hint"
        role="status"
        hidden={!form.error && !error && !model.locked}
      >
        {form.error || error || (model.locked ? "选中的链接已锁定。" : "")}
      </p>
    </fieldset>
  );
}
export function LinkInspectorPanel() {
  const model = useLink();
  return model && !model.creating ? (
    <LinkFields key={model.key} model={model} />
  ) : null;
}
function InsertDialog({ model }: { model: LinkModel }) {
  const ref = useRef<HTMLDialogElement>(null),
    [busy, setBusy] = useState(false);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      id="link-insert-dialog"
      ref={ref}
      aria-labelledby="link-insert-title"
      onKeyDown={(e) => e.stopPropagation()}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) linkActions.close();
      }}
    >
      <header>
        <h2 id="link-insert-title">插入跳转按钮</h2>
        <button
          type="button"
          aria-label="关闭"
          disabled={busy}
          onClick={linkActions.close}
        >
          ×
        </button>
      </header>
      <LinkFields key={model.key} model={model} onBusyChange={setBusy} />
    </dialog>
  );
}
export function LinkInsertDialog() {
  const model = useLink();
  return model?.creating ? <InsertDialog model={model} /> : null;
}
