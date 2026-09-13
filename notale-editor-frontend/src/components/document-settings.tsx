"use client";
import { CloseIcon } from "./ui/close-icon";
import { isComposingKey } from "../keyboard";
import { RecoveryDialog } from "./recovery-dialog";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { editorActions, editorSession } from "../state/editor-session";
import { useEditorSelector, shallowEqual } from "../state/use-editor-selector";
import { useAuthorDraft } from "../state/use-author-draft";
import { sizeValue, type HistoryRevision } from "../state/document-settings";
const close = () => editorSession.update({ documentDialog: undefined });
function SettingsDialog({
  id,
  title,
  busy,
  children,
  error,
}: {
  id: string;
  title: string;
  busy: boolean;
  children: ReactNode;
  error: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const node = ref.current!;
    node.showModal();
    return () => node.close();
  }, []);
  return (
    <dialog
      ref={ref}
      id={id}
      className="settings-dialog editor-form-dialog"
      aria-label={title}
      aria-busy={busy}
      onKeyDown={(event) => event.stopPropagation()}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button
          type="button"
          data-close
          disabled={busy}
          aria-label="关闭"
          onClick={close}
        >
          <CloseIcon />
        </button>
      </header>
      {children}
      <p className="settings-status" role="status" hidden={!error}>
        {error}
      </p>
    </dialog>
  );
}
function useTask() {
  const running = useRef(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return {
    busy,
    error,
    run: async (action: () => Promise<void>) => {
      if (running.current) return;
      running.current = true;
      setBusy(true);
      setError("");
      try {
        await action();
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error));
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
  };
}
function ThemeDialog() {
  const [source] = useState(() => ({
    key: editorSession.snapshot.document.id,
    value: JSON.stringify(editorSession.snapshot.document.theme),
  }));
  const [draft, setDraft] = useState(() =>
      JSON.stringify(JSON.parse(source.value), null, 2),
    ),
    task = useTask();
  return (
    <SettingsDialog
      id="theme-settings-dialog"
      title="高级主题设置"
      busy={task.busy}
      error={task.error}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void task.run(async () => {
            await editorActions.saveTheme(source, draft);
            close();
          });
        }}
      >
        <label>
          主题 CSS 变量
          <textarea
            id="theme-json"
            rows={12}
            spellCheck={false}
            value={draft}
            disabled={task.busy}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <footer>
          <button type="submit" className="primary" disabled={task.busy}>
            应用主题
          </button>
        </footer>
      </form>
    </SettingsDialog>
  );
}
function HistoryDialog() {
  const [source] = useState(() => ({
    id: editorSession.snapshot.document.id,
    version: editorSession.snapshot.version,
  }));
  const [rows, setRows] = useState<HistoryRevision[]>([]),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [attempt, setAttempt] = useState(0),
    [version, setVersion] = useState(source.version),
    [confirmed, setConfirmed] = useState(false),
    task = useTask();
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    setConfirmed(false);
    void editorActions
      .loadHistory(source.id)
      .then((rows) => {
        if (active) {
          setRows(rows);
          if (!rows.some((row) => row.version === source.version))
            setVersion(rows[0]?.version ?? 0);
        }
      })
      .catch((error) => {
        if (active)
          setLoadError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [source, attempt]);
  const other = version > 0 && version !== source.version;
  return (
    <SettingsDialog
      id="history-dialog"
      title="历史版本"
      busy={task.busy}
      error={task.error || loadError}
    >
      <p className="hint">恢复会创建新版本，已有历史仍会保留。</p>
      <div id="history-controls">
        <select
          id="history"
          aria-label="历史版本"
          value={version}
          disabled={loading || task.busy}
          onChange={(event) => {
            setVersion(Number(event.target.value));
            setConfirmed(false);
          }}
        >
          {rows.map((row) => (
            <option key={row.version} value={row.version}>
              v{row.version}
              {row.version === source.version ? " · 当前" : ""} ·{" "}
              {new Date(row.created_at).toLocaleString()}
            </option>
          ))}
        </select>
        <button
          id="restore"
          disabled={loading || task.busy || !other || !confirmed}
          onClick={() =>
            void task.run(async () => {
              await editorActions.restoreHistory(source.id, version);
              close();
            })
          }
        >
          恢复此版本
        </button>
      </div>
      <p id="history-description">
        {loading
          ? "正在加载历史版本…"
          : !rows.length
            ? "历史版本尚未加载"
            : other
              ? `将恢复到 v${version}。`
              : "当前版本"}
      </p>
      <button
        hidden={!loadError}
        disabled={loading || task.busy}
        onClick={() => setAttempt((value) => value + 1)}
      >
        重新加载历史版本
      </button>
      <label id="history-confirm-row" hidden={!other || loading}>
        <input
          type="checkbox"
          id="history-confirm"
          checked={confirmed}
          disabled={task.busy}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        确认将当前讲义恢复到所选版本
      </label>
    </SettingsDialog>
  );
}
export function DocumentDialogs() {
  const dialog = useEditorSelector((state) => state.documentDialog),
    loaded = useEditorSelector((state) => !!state.document);
  if (dialog === "recovery") return <RecoveryDialog />;
  if (!loaded) return null;
  return dialog === "theme" ? (
    <ThemeDialog />
  ) : dialog === "history" ? (
    <HistoryDialog />
  ) : null;
}
export function ThemeSettingsButton() {
  const loaded = useEditorSelector((state) => !!state.document);
  return (
    <button
      id="open-theme-settings"
      disabled={!loaded}
      onClick={() => editorSession.update({ documentDialog: "theme" })}
    >
      高级主题设置…
    </button>
  );
}
export function PageSizeSettings() {
  const field = useEditorSelector(
    (state) => {
      const doc = state.document?.document;
      return doc
        ? { key: doc.id, value: sizeValue(doc.width, doc.height) }
        : undefined;
    },
    (a, b) => a === b || (!!a && !!b && shallowEqual(a, b)),
  );
  const form = useAuthorDraft(field, editorActions.saveDeckSize),
    value = form.draft ? JSON.parse(form.draft) : { width: "", height: "" };
  return (
    <section className="global-settings-section">
      <h3>页面尺寸</h3>
      <div className="field-grid">
        {(["width", "height"] as const).map((axis) => (
          <label key={axis}>
            {axis === "width" ? "宽度" : "高度"}
            <input
              id={"deck-" + axis}
              type="number"
              min="100"
              max="10000"
              step="1"
              value={value[axis]}
              disabled={!field || form.pending}
              onKeyDown={(event) => {
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
              }}
              onChange={(event) =>
                form.change(
                  JSON.stringify({ ...value, [axis]: event.target.value }),
                )
              }
            />
          </label>
        ))}
      </div>
      <button
        id="save-deck-size"
        disabled={!field || form.pending}
        onClick={() => void form.apply()}
      >
        应用尺寸
      </button>
      <p id="deck-size-status" role="status" hidden={!form.error}>
        {form.error}
      </p>
    </section>
  );
}
