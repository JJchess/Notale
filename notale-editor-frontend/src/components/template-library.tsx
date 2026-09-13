"use client";
import { TEMPLATE_CATALOG_BASE } from '../template-catalog';
import {isComposingKey} from "../keyboard";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  templateLibraryState,
  templateLibraryActions as actions,
} from "../state/template-library";
import { useEditorSelector } from "../state/use-editor-selector";
const base = TEMPLATE_CATALOG_BASE;
function useLibrary() {
  return useSyncExternalStore(
    templateLibraryState.subscribe,
    templateLibraryState.getSnapshot,
    templateLibraryState.getServerSnapshot,
  );
}
export function TemplateLibrary() {
  const model = useLibrary(),
    visible = useEditorSelector((state) => state.sidebar.tool === "templates");
  useEffect(() => {
    if (visible && model.available) void actions.ensure();
  }, [visible, model.available]);
  const query = model.query.trim().toLowerCase(),
    entries = (model.entries ?? []).filter(
      (entry) =>
        !query || (entry.name + entry.id).toLowerCase().includes(query),
    );
  return (
    <>
      <input
        className="template-search"
        type="search"
        placeholder="搜索模板"
        aria-label="搜索模板"
        value={model.query}
        onChange={(event) => actions.search(event.target.value)}
      />
      <div className="template-cards">
        {entries.map((entry) => (
          <button
            type="button"
            className="template-card"
            key={entry.id}
            data-template-id={entry.id}
            aria-label={"预览 " + entry.name}
            onClick={() => actions.open(entry.id, "page")}
          >
            <img loading="lazy" src={base + entry.id + ".png"} alt="" />
            <span>{entry.name}</span>
          </button>
        ))}
      </div>
      <p className="template-status" role="status">
        {model.loading
          ? "正在加载模板…"
          : model.error ||
            (model.entries && !entries.length ? "没有匹配的模板" : "")}
      </p>
      {model.error && (
        <button onClick={() => void actions.ensure()}>重试</button>
      )}
    </>
  );
}
export function DiagramTemplates() {
  const model = useLibrary();
  return (
    <div data-diagram-library style={{ display: "contents" }}>
      {(model.entries ?? [])
        .filter((entry) => entry.diagram)
        .map((entry) => (
          <button
            type="button"
            key={entry.id}
            data-diagram-template={entry.id}
            aria-label={"预览并插入 " + entry.name}
            title={entry.name}
            onClick={() => actions.open(entry.id, "diagram")}
          >
            <img
              className="diagram-preview"
              loading="lazy"
              src={base + entry.id + "-diagram.png"}
              alt=""
              style={{ objectFit: "contain" }}
            />
            <span className="insert-item-label">{entry.name}</span>
          </button>
        ))}
    </div>
  );
}
export function DiagramStatus() {
  const model = useLibrary();
  return (
    <div data-diagram-status>
      <p className="hint" role="status" hidden={!model.loading && !model.error}>
        {model.loading ? "正在加载图示…" : model.error}
      </p>
      {model.error && (
        <button onClick={() => void actions.ensure()}>重试</button>
      )}
    </div>
  );
}
export function TemplatePreview() {
  const model = useLibrary();
  return model.preview ? <PreviewDialog /> : null;
}
function PreviewDialog() {
  const model = useLibrary(),
    dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => node.close();
  }, []);
  const preview = model.preview!,
    entries = (model.entries ?? []).filter((entry) =>
      preview.kind === "diagram"
        ? entry.diagram
        : !model.query.trim() ||
          (entry.name + entry.id)
            .toLowerCase()
            .includes(model.query.trim().toLowerCase()),
    ),
    index = entries.findIndex((entry) => entry.id === preview.entry.id);
  const [failed, setFailed] = useState(false);
  const [attempt,setAttempt]=useState(0);
  useEffect(() => {setFailed(false);setAttempt(0);}, [preview.entry.id, preview.kind]);
  const move = (offset: number) => {
    const next = entries[index + offset];
    if (next && !model.busy) actions.open(next.id, preview.kind);
  };
  return (
    <dialog
      ref={dialog}
      className="template-dialog"
      aria-labelledby="template-preview-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) actions.close();
      }}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        actions.close();
      }}
      onKeyDownCapture={(event) => {
        if(event.defaultPrevented||isComposingKey(event.nativeEvent)||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          actions.close();
        } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          event.stopPropagation();
          move(event.key === "ArrowLeft" ? -1 : 1);
        }
      }}
    >
      <div className="template-dialog-heading">
        <strong id="template-preview-title">{preview.entry.name}</strong>
        <div className="template-preview-nav">
          <button
            type="button"
            aria-label="上一个预览"
            title="上一个 · ←"
            disabled={model.busy || index <= 0}
            onClick={() => move(-1)}
          >
            ‹
          </button>
          <span>
            {index + 1} / {entries.length}
          </span>
          <button
            type="button"
            aria-label="下一个预览"
            title="下一个 · →"
            disabled={model.busy || index >= entries.length - 1}
            onClick={() => move(1)}
          >
            ›
          </button>
        </div>
        <button
          type="button"
          className="template-close"
          aria-label="关闭模板预览"
          title="关闭"
          disabled={model.busy}
          onClick={() => actions.close()}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <div className="template-preview">
        {failed && <div className="template-preview-error" role="status"><p>预览图片暂时无法加载</p><button type="button" onClick={()=>{setFailed(false);setAttempt(value=>value+1);}}>重试预览</button></div>}
        <img
          key={preview.entry.id+":"+preview.kind+":"+attempt}
          hidden={failed}
          onError={() => setFailed(true)}
          src={
            base +
            preview.entry.id +
            (preview.kind === "diagram" ? "-diagram" : "") +
            ".png"+(attempt?"?retry="+attempt:"")
          }
          alt={preview.entry.name}
        />
      </div>
      <div className="template-dialog-actions">
        <span role="status">{model.message}</span>
        <button
          type="button"
          className="primary"
          data-template-use={preview.kind}
          disabled={model.busy}
          onClick={() => void actions.insert()}
        >
          {preview.kind === "diagram" ? "插入当前页" : "添加为新页面"}
        </button>
      </div>
    </dialog>
  );
}
