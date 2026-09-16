"use client";
import { isComposingKey } from "../keyboard";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import katex from "katex";
import { renderTex } from "../templates";
import {
  equationState,
  equationActions,
  type EquationEditing,
} from "../state/equation-dialog";
function useEquation() {
  return useSyncExternalStore(
    equationState.subscribe,
    equationState.getSnapshot,
    equationState.getServerSnapshot,
  );
}
export function EquationButton() {
  const model = useEquation();
  return (
    <button
      id="open-equation-editor"
      hidden={!model.available}
      disabled={model.locked}
      onClick={() => equationActions.open()}
    >
      编辑公式
    </button>
  );
}
export function EquationDialog() {
  const { editing } = useEquation();
  return editing ? <EquationForm key={editing.id} editing={editing} /> : null;
}
function EquationForm({ editing }: { editing: EquationEditing }) {
  const [tex, setTex] = useState(editing.tex),
    [display, setDisplay] = useState(editing.display),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    running = useRef(false);
  useLayoutEffect(() => {
    const node = dialog.current!;
    node.showModal();
    node.querySelector<HTMLTextAreaElement>("#equation-tex")?.focus();
    return () => node.close();
  }, []);
  const preview = useMemo(() => {
    try {
      return {
        html: katex.renderToString(tex, {
          displayMode: display,
          throwOnError: true,
        }),
        error: "",
      };
    } catch (e) {
      return {
        html: renderTex(tex, display),
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }, [tex, display]);
  const close = () => {
    if (!running.current) equationActions.close();
  };
  async function save() {
    if (running.current || preview.error) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await equationActions.save(editing, tex, display, preview.html);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      id="equation-editor-dialog"
      aria-labelledby="equation-editor-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (
          !isComposingKey(e.nativeEvent) &&
          (e.key === "Enter" || e.key.toLowerCase() === "s") &&
          (e.ctrlKey || e.metaKey)
        ) {
          e.preventDefault();
          void save();
        }
      }}
    >
      <header>
        <h2 id="equation-editor-title">编辑公式</h2>
        <button
          id="close-equation-editor"
          aria-label="关闭公式编辑"
          disabled={busy}
          onClick={close}
        >
          ×
        </button>
      </header>
      <label>
        LaTeX
        <textarea
          id="equation-tex"
          autoFocus
          aria-invalid={!!preview.error}
          aria-describedby="equation-status"
          rows={4}
          spellCheck={false}
          disabled={busy}
          value={tex}
          onChange={(e) => {
            setTex(e.target.value);
            setError("");
          }}
        />
      </label>
      <label className="inline">
        <input
          id="equation-inline"
          type="checkbox"
          disabled={busy}
          checked={!display}
          onChange={(e) => setDisplay(!e.target.checked)}
        />{" "}
        行内公式
      </label>
      <div
        id="equation-preview"
        aria-label="公式预览"
        dangerouslySetInnerHTML={{ __html: preview.html }}
      />
      <p id="equation-status" role="status">
        {error || preview.error}
      </p>
      <footer>
        <button
          id="save-equation"
          className="primary"
          disabled={busy || !!preview.error}
          onClick={() => void save()}
        >
          保存公式
        </button>
        <button id="cancel-equation" disabled={busy} onClick={close}>
          取消
        </button>
      </footer>
    </dialog>
  );
}
