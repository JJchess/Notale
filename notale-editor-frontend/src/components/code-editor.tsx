"use client";
import {useI18n} from '../i18n/react';

import { isComposingKey } from "../keyboard";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { LANGUAGES, highlight } from "../code-highlight";
import {
  codeState,
  codeActions,
  codeDraft,
  type CodeEditing,
} from "../state/code-editor";

function useCode() {
  return useSyncExternalStore(
    codeState.subscribe,
    codeState.getSnapshot,
    codeState.getServerSnapshot,
  );
}
export function CodeButton() {
 const t=useI18n();

  const model = useCode();
  return (
    <button
      id="open-code-editor"
      hidden={!model.available}
      disabled={model.locked}
      onClick={() => codeActions.open()}
    >{t("编辑代码")}</button>
  );
}
export function CodeDialog() {


  const { editing } = useCode();
  return editing ? <CodeForm key={editing.id} editing={editing} /> : null;
}
function CodeForm({ editing }: { editing: CodeEditing }) {
 const t=useI18n();

  const original = codeDraft(editing.item);
  const [source, setSource] = useState(original.code);
  const [language, setLanguage] = useState(original.language);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    running = useRef(false);
  useLayoutEffect(() => {
    const node = dialog.current!;
    node.showModal();
    node.querySelector<HTMLTextAreaElement>("#code-source")?.focus();
    return () => node.close();
  }, []);
  const preview = useMemo(
    () => highlight(source, language),
    [source, language],
  );
  const close = () => {
    if (!running.current) codeActions.close();
  };
  async function save() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await codeActions.save(editing, source, language);
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
      id="code-editor-dialog"
      aria-labelledby="code-editor-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (
          !isComposingKey(event.nativeEvent) &&
          (event.key === "Enter" || event.key.toLowerCase() === "s") &&
          (event.ctrlKey || event.metaKey)
        ) {
          event.preventDefault();
          void save();
        }
      }}
    >
      <header>
        <h2 id="code-editor-title">{t("编辑代码")}</h2>
        <button
          id="close-code"
          aria-label={t("关闭代码编辑")}
          disabled={busy}
          onClick={close}
        >
          ×
        </button>
      </header>
      <label>{t("语言")}<select
          id="code-language"
          value={language}
          disabled={busy}
          onChange={(event) => setLanguage(event.target.value)}
        >
          {LANGUAGES.map(([id, label]) => (
            <option key={id} value={id}>
              {t(label)}
            </option>
          ))}
        </select>
      </label>
      <label>{t("源代码")}<textarea
          id="code-source"
          autoFocus
          rows={10}
          spellCheck={false}
          value={source}
          disabled={busy}
          onChange={(event) => {
            setSource(event.target.value);
            setError("");
          }}
        />
      </label>
      <pre
        id="code-preview"
        aria-label={t("高亮预览")}
        dangerouslySetInnerHTML={{ __html: preview }}
      />
      <p role="status">{t(error)}</p>
      <footer>
        <button
          id="save-code"
          className="primary"
          disabled={busy}
          onClick={() => void save()}
        >{t("保存代码")}</button>
        <button id="cancel-code" disabled={busy} onClick={close}>{t("取消")}</button>
      </footer>
    </dialog>
  );
}
