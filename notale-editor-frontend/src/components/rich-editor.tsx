"use client";
import { isComposingKey } from "../keyboard";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useEditorSelector } from "../state/use-editor-selector";
import { materializeRootDecoration } from "../state/rich-decoration";
import { toHex } from "../state/appearance";
import { TextFormatIcon } from "./text-format-icon";
import {
  richEditorState,
  richEditorActions,
  type RichEditing,
} from "../state/rich-editor";
function useRich() {
  return useSyncExternalStore(
    richEditorState.subscribe,
    richEditorState.getSnapshot,
    richEditorState.getServerSnapshot,
  );
}
export function RichEditorButton({inTextGroup = false}: {inTextGroup?: boolean}) {
  const model = useRich();
  const textSelection = useEditorSelector(state => state.inspector.typography);
  if (textSelection !== inTextGroup) return null;
  return (
    <button
      id="open-rich-editor"
      hidden={!model.available}
      disabled={model.locked}
      onClick={() => richEditorActions.open()}
    >
      编辑文字
    </button>
  );
}
export function RichEditorDialog() {
  const { editing } = useRich();
  return editing ? <RichDialog editing={editing} /> : null;
}
const commands = [
  ["bold", "加粗"],
  ["italic", "斜体"],
  ["underline", "下划线"],
  ["strikeThrough", "删除线"],
  ["insertUnorderedList", "项目符号"],
  ["insertOrderedList", "编号"],
  ["indent", "增加缩进"],
  ["outdent", "减少缩进"],
  ["justifyLeft", "左对齐"],
  ["justifyCenter", "居中"],
  ["justifyRight", "右对齐"],
  ["justifyFull", "两端对齐"],
];
function RichDialog({ editing }: { editing: RichEditing }) {
  const dialog = useRef<HTMLDialogElement>(null),
    surface = useRef<HTMLDivElement>(null),
    selection = useRef<Range | undefined>(undefined),
    mounted = useRef(true),
    saving = useRef(false),
    rootDecoration = useRef<"none" | undefined>(undefined),
    paragraphAlignment = useRef<
      "left" | "center" | "right" | "justify" | undefined
    >(undefined);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [textColor, setTextColor] = useState("#000000"),
    [formats, setFormats] = useState<Record<string, boolean>>({});
  const toggles = [
    "bold",
    "italic",
    "underline",
    "strikeThrough",
    "insertUnorderedList",
    "insertOrderedList",
    "justifyLeft",
    "justifyCenter",
    "justifyRight",
    "justifyFull",
  ];
  function refreshFormats() {
    const next = Object.fromEntries(
      toggles.map((command) => [command, document.queryCommandState(command)]),
    );
    if (!editing.blockEditing && surface.current) {
      const align = getComputedStyle(surface.current).textAlign;
      for (const [command, value] of Object.entries({
        justifyLeft: "left",
        justifyCenter: "center",
        justifyRight: "right",
        justifyFull: "justify",
      }))
        next[command] =
          align === value || (align === "start" && value === "left");
    }
    setTextColor(
      toHex(document.queryCommandValue("foreColor")) ??
        toHex(editing.styles.color) ??
        "#000000",
    );
    setFormats((previous) =>
      JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
    );
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useLayoutEffect(() => {
    const node = surface.current!;
    node.innerHTML = editing.html;
    selection.current = undefined;
    paragraphAlignment.current = undefined;
    rootDecoration.current = undefined;
    setError("");
    dialog.current!.showModal();
    node.focus();
    document.execCommand("defaultParagraphSeparator", false, "p");
    return () => {
      dialog.current?.close();
    };
  }, [editing.id]);
  useLayoutEffect(() => {
    const node = surface.current!;
    for (const p of [
      "font-family",
      "font-weight",
      "font-style",
      "text-decoration",
      "white-space",
      "color",
      "line-height",
      "letter-spacing",
      "text-align",
    ]) {
      if (p === "text-decoration" && rootDecoration.current) {
        node.style.textDecoration = rootDecoration.current;
        continue;
      }
      if (p === "text-align" && paragraphAlignment.current) {
        node.style.textAlign = paragraphAlignment.current;
        continue;
      }
      node.style.removeProperty(p);
      if (editing.styles[p]) node.style.setProperty(p, editing.styles[p]);
    }
    node.style.fontSize =
      Math.min(32, parseFloat(editing.styles["font-size"]) || 24) + "px";
    refreshFormats();
  }, [editing.styles]);
  useEffect(() => {
    const change = () => {
      const current = document.getSelection(),
        node = surface.current;
      if (
        current?.rangeCount &&
        node?.contains(current.anchorNode) &&
        node.contains(current.focusNode)
      ) {
        selection.current = current.getRangeAt(0).cloneRange();
        refreshFormats();
      }
    };
    document.addEventListener("selectionchange", change);
    return () => document.removeEventListener("selectionchange", change);
  }, []);
  async function save() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await richEditorActions.save(
        editing.id,
        surface.current!.innerHTML,
        paragraphAlignment.current,
        rootDecoration.current,
      );
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const close = () => {
    if (!saving.current) richEditorActions.close();
  };
  function format(command: string, value?: string) {
    const editor = surface.current!;
    editor.focus();
    if (selection.current) {
      const current = document.getSelection()!;
      current.removeAllRanges();
      current.addRange(selection.current);
    }
    if (
      (command === "underline" || command === "strikeThrough") &&
      materializeRootDecoration(editor)
    )
      rootDecoration.current = "none";
    const alignment = (
      {
        justifyLeft: "left",
        justifyCenter: "center",
        justifyRight: "right",
        justifyFull: "justify",
      } as const
    )[command as "justifyLeft"];
    if (alignment && !editing.blockEditing) {
      editor.style.textAlign = alignment;
      paragraphAlignment.current = alignment;
      refreshFormats();
      return;
    }
    // Links retain their own UA color even when a surrounding span is colored.
    // Apply a color to fully selected links explicitly; partial selections remain browser ranges.
    const coloredLinks: HTMLAnchorElement[] = [];
    const active = document.getSelection();
    if (command === "foreColor" && value && active?.rangeCount) {
      const range = active.getRangeAt(0);
      for (const link of editor.querySelectorAll("a")) {
        const contents = document.createRange();
        contents.selectNodeContents(link);
        if (
          range.compareBoundaryPoints(Range.START_TO_START, contents) <= 0 &&
          range.compareBoundaryPoints(Range.END_TO_END, contents) >= 0
        )
          coloredLinks.push(link);
      }
    }
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(command, false, value);
    for (const link of coloredLinks)
      if (editor.contains(link)) link.style.color = value!;
    const current = document.getSelection();
    if (current?.rangeCount)
      selection.current = current.getRangeAt(0).cloneRange();
    refreshFormats();
  }

  return (
    <dialog
      ref={dialog}
      id="rich-editor-dialog"
      aria-labelledby="rich-editor-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (!isComposingKey(event.nativeEvent) && (event.ctrlKey || event.metaKey) &&
            event.key.toLowerCase() === "u") {
          event.preventDefault();
          format("underline");
          return;
        }
        if (
          !isComposingKey(event.nativeEvent) &&
          (event.ctrlKey || event.metaKey) &&
          (event.key.toLowerCase() === "s" || event.key === "Enter")
        ) {
          event.preventDefault();
          void save();
        }
      }}
    >
      <header>
        <h2 id="rich-editor-title">编辑文字与排版</h2>
        <button
          id="rich-cancel"
          aria-label="关闭文字编辑"
          disabled={busy}
          onClick={close}
        >
          ×
        </button>
      </header>
      <div className="rich-toolbar" role="toolbar" aria-label="文字格式">
        {commands.map(([command, label]) => (
          <button
            key={command}
            data-rich-command={command}
            title={label}
            aria-label={label}
            aria-pressed={
              toggles.includes(command) ? !!formats[command] : undefined
            }
            disabled={
              busy ||
              (!editing.blockEditing &&
                [
                  "insertUnorderedList",
                  "insertOrderedList",
                  "indent",
                  "outdent",
                ].includes(command))
            }
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => format(command)}
          >
            <TextFormatIcon name={command} />
          </button>
        ))}
        <label>
          文字颜色
          <input
            id="rich-color"
            type="color"
            value={textColor}
            disabled={busy}
            onChange={(e) => format("foreColor", e.target.value)}
          />
        </label>
      </div>
      <div
        ref={surface}
        id="rich-surface"
        contentEditable={!busy}
        suppressContentEditableWarning
        role="textbox"
        aria-label="文字内容"
        aria-multiline="true"
        spellCheck={false}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !isComposingKey(event.nativeEvent) &&
            !event.ctrlKey &&
            !event.metaKey &&
            !editing.blockEditing
          ) {
            event.preventDefault();
            document.execCommand("insertLineBreak");
          }
        }}
        onInput={() => {
          setError("");
          refreshFormats();
        }}
        onPaste={(event) => {
          event.preventDefault();
          const text = event.clipboardData.getData("text/plain");
          if (editing.blockEditing)
            document.execCommand("insertText", false, text);
          else {
            // A paragraph cannot contain paragraphs. Escape clipboard text before
            // inserting explicit line breaks, keeping the original object intact.
            const escaped = document.createElement("div");
            escaped.textContent = text.replace(/\r\n?/g, "\n");
            document.execCommand(
              "insertHTML",
              false,
              escaped.innerHTML.replace(/\n/g, "<br>"),
            );
          }
        }}
        onDrop={(event) => event.preventDefault()}
        onClick={(event) => {
          if ((event.target as Element).closest("a")) event.preventDefault();
        }}
      />
      <p id="rich-editor-status" role="status" hidden={!error}>
        {error}
      </p>
      <footer>
        <button
          id="rich-save"
          className="primary"
          disabled={busy}
          onClick={() => void save()}
        >
          保存文字
        </button>
        <button id="rich-discard" disabled={busy} onClick={close}>
          取消
        </button>
      </footer>
    </dialog>
  );
}
