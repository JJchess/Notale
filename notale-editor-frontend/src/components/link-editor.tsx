"use client";
import {useI18n} from '../i18n/react';

import { isComposingKey } from "../keyboard";

import { useState, useSyncExternalStore } from "react";
import { linkActions, linkEditorState, type LinkModel } from "../state/link-editor";
import { useAuthorDraft } from "../state/use-author-draft";
const useLink = () =>
  useSyncExternalStore(
    linkEditorState.subscribe,
    linkEditorState.getSnapshot,
    linkEditorState.getServerSnapshot,
  );
function LinkFields({ model }: { model: LinkModel }) {
 const t=useI18n();

  const form = useAuthorDraft(model, linkActions.save),
    draft = form.draft
      ? JSON.parse(form.draft)
      : { kind: "page", pageId: "", url: "" },
    [removing, setRemoving] = useState(false),
    [error, setError] = useState("");
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
      <legend>{t("链接与页面跳转")}</legend>
      <label>{t("目标类型")}<select
          id="link-kind"
          value={draft.kind}
          onChange={(e) => change("kind", e.target.value)}
        >
          <option value="page">{t("讲义中的页面")}</option>
          <option value="url">{t("外部链接")}</option>
        </select>
      </label>
      <label id="link-page-label" hidden={draft.kind !== "page"}>{t("跳转到")}<select
          id="link-page"
          value={draft.pageId}
          onChange={(e) => change("pageId", e.target.value)}
        >
          {!model.pages.some((page) => page.id === draft.pageId) && (<option value={draft.pageId} disabled>{t("目标页面已不存在，请重新选择")}</option>)}
          {model.pages.map((page, index) => (
            <option key={page.id} value={page.id}>
              {index + 1} · {page.name}
            </option>
          ))}
        </select>
      </label>
      <label id="link-url-label" hidden={draft.kind !== "url"}>{t("链接地址")}<input
          id="link-url"
          type="text"
          inputMode="url"
          autoComplete="url"
          placeholder="https://example.com"
          value={draft.url}
          onChange={(e) => change("url", e.target.value)}
        />
      </label>
      <button
        id="update-link"
        type="button"
        onClick={() => void form.apply()}
      >{t("更新所选链接地址")}</button>
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
      >{t("移除所选链接")}</button>
      <p
        id="link-status"
        className="hint"
        role="status"
        hidden={!form.error && !error && !model.locked}
      >
        {t(form.error) || t(error) || (model.locked ? t("选中的链接已锁定。") : "")}
      </p>
    </fieldset>
  );
}
export function LinkInspectorPanel() {


  const model = useLink();
  return model ? <LinkFields key={model.key} model={model} /> : null;
}
