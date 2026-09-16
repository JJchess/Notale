"use client";
import { linkAddress } from "../state/link-address";
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  textLinkState,
  applyTextLink,
  closeTextLink,
  type TextLinkRequest,
} from "../state/text-link-dialog";
export function TextLinkDialog() {
  const source = useSyncExternalStore(
    textLinkState.subscribe,
    textLinkState.getSnapshot,
    textLinkState.getServerSnapshot,
  );
  return source ? <LinkForm key={source.id} source={source} /> : null;
}
function LinkForm({ source }: { source: TextLinkRequest }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  useLayoutEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => node.close();
  }, []);
  function apply(value: string, remove = false) {
    try {
      applyTextLink(source, remove ? "" : linkAddress(value));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }
  return (
    <dialog
      ref={dialog}
      className="context-link-dialog"
      aria-label="文字链接"
      onCancel={(event) => {
        event.preventDefault();
        closeTextLink(source);
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          apply(url);
        }}
      >
        <label>
          链接地址
          <input
            autoFocus
            type="text"
            inputMode="url"
            autoComplete="url"
            placeholder="https://example.com"
            aria-label="链接地址"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <footer>
          <button type="button" onClick={() => closeTextLink(source)}>
            取消
          </button>
          <button type="button" onClick={() => apply("", true)}>
            移除链接
          </button>
          <button type="submit" className="primary">
            应用
          </button>
        </footer>
      </form>
    </dialog>
  );
}
