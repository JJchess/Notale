"use client";
import { isComposingKey } from "../../keyboard";

import { useId, useLayoutEffect, useRef, useState } from "react";
import {
  boundedNumber,
  numericExpression,
} from "../../state/numeric-expression";
interface NumberFieldProps {
  id: string;
  label: string;
  value: number | string | undefined;
  disabled?: boolean;
  hidden?: boolean;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  onCommit: (value: number) => unknown;
  onError?: (error: unknown) => void;
}
/** One local draft; only completed edits enter the document command layer. */
export function NumberField({
  id,
  label,
  value,
  disabled,
  hidden,
  min,
  max,
  step = 1,
  integer = false,
  onCommit,
  onError,
}: NumberFieldProps) {
  const text = value === undefined ? "" : String(value),
    [draft, setDraft] = useState(text),
    [error, setError] = useState("");
  const revision = useRef(0);
  useLayoutEffect(
    () => () => {
      revision.current++;
    },
    [],
  );
  const focused = useRef(false),
    dirty = useRef(false),
    current = useRef(text),
    latest = useRef({ onCommit, onError }),
    errorId = useId();
  latest.current = { onCommit, onError };
  useLayoutEffect(() => {
    if (!focused.current || !dirty.current) {
      if (current.current !== text) {
        revision.current++;
        dirty.current = false;
        setError("");
      }
      current.current = text;
      setDraft(text);
    }
  }, [text]);
  const change = (next: string) => {
    revision.current++;
    current.current = next;
    dirty.current = true;
    setDraft(next);
    setError("");
  };
  const cancel = () => {
    revision.current++;
    dirty.current = false;
    current.current = text;
    setDraft(text);
    setError("");
  };
  function commit() {
    if (!dirty.current || disabled) return;
    try {
      const next = boundedNumber(current.current, min, max);
      if (integer && !Number.isInteger(next)) throw Error("请输入整数");
      dirty.current = false;
      current.current = String(next);
      setDraft(String(next));
      setError("");
      if (next !== Number(text) || text === "") {
        const submitted = ++revision.current;
        const failed = (cause: unknown) => {
          if (revision.current !== submitted) return;
          dirty.current = true;
          setError(cause instanceof Error ? cause.message : String(cause));
          latest.current.onError?.(cause);
        };
        try {
          void Promise.resolve(latest.current.onCommit(next)).catch(failed);
        } catch (cause) {
          failed(cause);
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }
  return (
    <label className="editor-number-field" hidden={hidden}>
      {label}
      <input
        id={id}
        type="text"
        role="spinbutton"
        data-editor-number=""
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={draft}
        disabled={disabled}
        aria-valuenow={
          Number.isFinite(Number(draft)) && draft !== ""
            ? Number(draft)
            : undefined
        }
        aria-valuemin={min}
        aria-valuemax={max}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(event) => change(event.currentTarget.value)}
        onBlur={() => {
          focused.current = false;
          commit();
        }}
        onKeyDown={(event) => {
          if (isComposingKey(event.nativeEvent)) return;
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            cancel();
            event.currentTarget.blur();
          } else if (event.key === "Enter") {
            event.preventDefault();
            commit();
            if (!dirty.current) event.currentTarget.blur();
          } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            event.stopPropagation();
            let base: number;
            try {
              base = numericExpression(current.current);
            } catch {
              base = Number(text) || 0;
            }
            const increment =
                step *
                (event.shiftKey ? 10 : event.altKey && !integer ? 0.1 : 1),
              next = base + (event.key === "ArrowUp" ? increment : -increment);
            change(
              String(
                Number(
                  Math.max(
                    min ?? -Infinity,
                    Math.min(max ?? Infinity, next),
                  ).toPrecision(12),
                ),
              ),
            );
          }
        }}
        onKeyUp={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.stopPropagation();
            commit();
          }
        }}
      />
      {error && (
        <span className="editor-field-error" id={errorId} role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
