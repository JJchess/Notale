"use client";
import { CloseIcon } from "./ui/close-icon";
import { isComposingKey } from "../keyboard";

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { findDialogState, findActions } from "../state/find-dialog";
export function FindReplaceDialog() {
  const model = useSyncExternalStore(
      findDialogState.subscribe,
      findDialogState.getSnapshot,
      findDialogState.getServerSnapshot,
    ),
    dialog = useRef<HTMLDialogElement>(null),
    query = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    const node = dialog.current!;
    if (model.open) {
      if (!node.open) node.showModal();
      query.current?.focus();
    } else if (node.open) node.close();
    return () => {
      if (node.open) node.close();
    };
  }, [model.open]);
  const [limit, setLimit] = useState(50),
    pendingFocus = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    setLimit(50);
    pendingFocus.current = undefined;
  }, [model.result]);
  useLayoutEffect(() => {
    if (pendingFocus.current !== undefined) {
      dialog.current
        ?.querySelectorAll<HTMLButtonElement>("[data-hit]")
        [pendingFocus.current]?.focus();
      pendingFocus.current = undefined;
    }
  }, [limit]);
  const resultFocus = (index: number) =>
    dialog.current
      ?.querySelectorAll<HTMLButtonElement>("[data-hit]")
      [index]?.focus();
  return (
    <dialog
      ref={dialog}
      className="editor-form-dialog"
      id="find-replace-dialog"
      aria-labelledby="find-replace-title"
      onCancel={(e) => {
        e.preventDefault();
        findActions.close();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <header>
        <h2 id="find-replace-title">查找和替换</h2>
        <button
          id="close-find"
          aria-label="关闭查找"
          disabled={model.busy}
          onClick={() => findActions.close()}
        >
          <CloseIcon />
        </button>
      </header>
      <label>
        查找内容
        <input
          ref={query}
          id="find-query"
          onKeyDown={(event) => {
            if (
              !isComposingKey(event.nativeEvent) &&
              event.key === "ArrowDown" &&
              model.result?.hits.length
            ) {
              event.preventDefault();
              resultFocus(0);
            }
          }}
          autoComplete="off"
          disabled={model.busy}
          value={model.query}
          onChange={(e) => findActions.change({ query: e.target.value })}
        />
      </label>
      <label>
        替换为
        <input
          id="find-replacement"
          autoComplete="off"
          disabled={model.busy}
          value={model.replacement}
          onChange={(e) => findActions.change({ replacement: e.target.value })}
        />
      </label>
      <label className="inline">
        <input
          id="find-case"
          type="checkbox"
          disabled={model.busy}
          checked={model.sensitive}
          onChange={(e) => findActions.change({ sensitive: e.target.checked })}
        />{" "}
        区分大小写
      </label>
      <p id="find-status" role="status">
        {model.error || model.status}
      </p>
      <div id="find-results" className="find-results">
        {model.result?.hits.slice(0, limit).map((hit, index) => (
          <button
            key={JSON.stringify([hit.slideId, hit.target])}
            type="button"
            data-hit={index}
            onKeyDown={(event) => {
              if (
                isComposingKey(event.nativeEvent) ||
                event.altKey ||
                event.ctrlKey ||
                event.metaKey
              )
                return;
              const last = Math.min(limit, model.result?.hits.length ?? 0) - 1,
                at =
                  event.key === "ArrowDown"
                    ? Math.min(last, index + 1)
                    : event.key === "ArrowUp"
                      ? Math.max(0, index - 1)
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? last
                          : -1;
              if (at < 0) return;
              event.preventDefault();
              resultFocus(at);
            }}
            disabled={model.busy}
            onClick={() => void findActions.go(hit)}
          >
            <small>{hit.slideName}</small>
            {hit.text.trim().slice(0, 60)}
          </button>
        ))}
      </div>
      {(model.result?.hits.length ?? 0) > limit && (
        <button
          id="find-more"
          type="button"
          disabled={model.busy}
          onClick={() => {
            pendingFocus.current = limit;
            setLimit((value) => value + 50);
          }}
        >
          显示更多（剩余 {(model.result?.hits.length ?? 0) - limit}）
        </button>
      )}
      <footer>
        {model.error && (
          <button disabled={model.busy} onClick={() => findActions.search()}>
            重新查找
          </button>
        )}
        <button
          id="find-replace-all"
          className="primary"
          disabled={model.busy || !model.result?.hits.length}
          onClick={() => void findActions.replace()}
        >
          全部替换
        </button>
        <button
          id="find-close"
          disabled={model.busy}
          onClick={() => findActions.close()}
        >
          完成
        </button>
      </footer>
    </dialog>
  );
}

export function FindReplaceButton() {
  return (
    <button
      id="open-find-replace"
      title="查找和替换讲义中的文字 · Ctrl H"
      onClick={() => findActions.open()}
    >
      查找和替换…
    </button>
  );
}
