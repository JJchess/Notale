"use client";
import { CloseIcon } from "./ui/close-icon";
import { LayoutValues } from "./layout-values";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  pageSettingsState,
  pageSettingsActions,
  type PageBasics,
} from "../page-settings";
import { useEditorSelector } from "../state/use-editor-selector";
export function PageSettingsButton() {
  const loaded = useEditorSelector((state) => !!state.document);
  return (
    <button
      disabled={!loaded}
      id="open-page-settings"
      aria-label="当前页面设置"
      title="页面设置 · 右键页面或 F2"
      onClick={() => pageSettingsActions.open()}
    >
      ⋯
    </button>
  );
}
export function PageSettingsDialog() {
  const source = useSyncExternalStore(
      pageSettingsState.subscribe,
      pageSettingsState.getSnapshot,
      pageSettingsState.getServerSnapshot,
    ),
    doc = useEditorSelector((state) => state.document?.document),
    ref = useRef<HTMLDialogElement>(null),
    running = useRef(false);
  const [name, setName] = useState(""),
    [section, setSection] = useState(""),
    [hidden, setHidden] = useState(false),
    [transition, setTransition] = useState<PageBasics["transition"]>("none"),
    [auto, setAuto] = useState(false),
    [seconds, setSeconds] = useState("5"),
    [choice, setChoice] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const page =
    source && doc?.id === source.documentId
      ? doc.slides.find((page) => page.id === source.page.id)
      : undefined;
  const close = () => {
    if (!running.current) pageSettingsState.set(undefined);
  };
  useLayoutEffect(() => {
    const dialog = ref.current!;
    if (source) {
      const p = source.page;
      setName(p.name);
      setSection(p.section);
      setHidden(p.hidden);
      setTransition(p.transition);
      setAuto(p.advanceAfter > 0);
      setSeconds(String(p.advanceAfter ? p.advanceAfter / 1000 : 5));
      setChoice(p.layoutId ?? "");
      setError("");
      pageSettingsActions.resetValues();
      if (!dialog.open) dialog.showModal();
      dialog.querySelector<HTMLInputElement>("#page-settings-name")?.focus();
    } else dialog.close();
  }, [source]);
  useEffect(
    () => () => {
      pageSettingsState.set(undefined);
    },
    [],
  );
  useEffect(() => {
    if (source && page) pageSettingsActions.renderValues();
  }, [source, doc]);
  const run = async (action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return (
    <dialog
      className="editor-form-dialog"
      id="page-settings-dialog"
      ref={ref}
      aria-labelledby="page-settings-title"
      onKeyDown={(e) => e.stopPropagation()}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header>
        <h2 id="page-settings-title">页面设置</h2>
        <button
          type="button"
          id="close-page-settings"
          aria-label="关闭页面设置"
          disabled={busy}
          onClick={close}
        >
          <CloseIcon />
        </button>
      </header>
      <form
        id="page-basic-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (source)
            void run(async () => {
              const advanceAfter = auto
                ? Math.round(Number(seconds) * 1000)
                : 0;
              if (
                auto &&
                (!seconds.trim() ||
                  !Number.isFinite(advanceAfter) ||
                  advanceAfter <= 0 ||
                  advanceAfter > 3600000)
              )
                throw Error("自动翻页的停留时间应大于 0 且不超过 3600 秒");
              await pageSettingsActions.save(source, {
                name: name.trim(),
                section: section.trim(),
                hidden,
                transition,
                advanceAfter,
              });
              pageSettingsState.set(undefined);
            });
        }}
      >
        <fieldset
          disabled={busy || !page}
          style={{ border: 0, padding: 0, margin: 0 }}
        >
          <label>
            页面名称
            <input
              id="page-settings-name"
              required
              maxLength={300}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            章节
            <input
              id="page-settings-section"
              maxLength={300}
              placeholder="可选"
              value={section}
              onChange={(e) => setSection(e.target.value)}
            />
          </label>
          <label className="page-hidden-option">
            <input
              id="page-settings-hidden"
              type="checkbox"
              checked={hidden}
              onChange={(e) => setHidden(e.target.checked)}
            />
            放映时跳过此页
          </label>
          <details className="settings-section">
            <summary>切换与计时</summary>
            <label>
              页面转场
              <select
                id="page-settings-transition"
                value={transition}
                onChange={(e) =>
                  setTransition(e.target.value as PageBasics["transition"])
                }
              >
                {Object.entries({
                  none: "无",
                  fade: "淡入淡出",
                  slide: "滑动",
                  convex: "凸面旋转",
                  concave: "凹面旋转",
                  zoom: "缩放",
                }).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="page-hidden-option">
              <input
                id="page-settings-auto"
                type="checkbox"
                checked={auto}
                onChange={(e) => setAuto(e.target.checked)}
              />
              自动翻页
            </label>
            <label id="page-settings-seconds-label" hidden={!auto}>
              停留时间（秒）
              <input
                id="page-settings-seconds"
                type="number"
                min="0.001"
                max="3600"
                step="0.001"
                value={seconds}
                disabled={!auto}
                onChange={(e) => setSeconds(e.target.value)}
              />
            </label>
          </details>
          <footer>
            <button
              id="save-page-settings"
              type="submit"
              className="primary"
              disabled={!name.trim()}
            >
              保存页面设置
            </button>
          </footer>
        </fieldset>
      </form>
      <p id="page-settings-status" role="status" hidden={!error}>
        {error}
      </p>
      <details className="settings-section" id="page-master-settings">
        <summary>母版</summary>
        <label>
          本页母版
          <select
            id="page-master-choice"
            value={choice}
            disabled={busy || !page}
            onChange={(e) => setChoice(e.target.value)}
          >
            <option value="">不使用母版</option>
            {doc?.layouts.map((layout) => (
              <option key={layout.id} value={layout.id}>
                {layout.name}
              </option>
            ))}
          </select>
        </label>
        <div className="settings-actions">
          <button
            id="page-master-apply"
            disabled={busy || !page}
            onClick={() =>
              source &&
              void run(() => pageSettingsActions.applyMaster(source, choice))
            }
          >
            应用本页
          </button>
          <button
            id="page-master-edit"
            disabled={busy || !page || !choice}
            onClick={() =>
              source &&
              void run(async () => {
                await pageSettingsActions.editMaster(source, choice);
                pageSettingsState.set(undefined);
              })
            }
          >
            编辑母版
          </button>
          <button
            id="page-master-detach"
            disabled={busy || !page?.layoutId}
            onClick={() =>
              source &&
              void run(async () => {
                await pageSettingsActions.detachMaster(source);
                setChoice("");
              })
            }
          >
            分离母版
          </button>
        </div>
        <fieldset
          disabled={busy || !page}
          style={{ border: 0, padding: 0, margin: 0 }}
        >
          <div id="page-layout-values">
            <LayoutValues />
          </div>
        </fieldset>
      </details>
    </dialog>
  );
}
