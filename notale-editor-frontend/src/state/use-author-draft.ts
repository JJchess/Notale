"use client";
import { useLayoutEffect, useRef, useState } from "react";
/** Preserve local edits and isolate asynchronous results from later editing sessions. */
export function useAuthorDraft<T extends { key: string; value: string }>(
  field: T | undefined,
  commit: (source: T, value: string) => Promise<void>,
) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const baseline = useRef<T | undefined>(undefined);
  const dirty = useRef(false);
  const latest = useRef(field);
  const running = useRef(false);
  const revision = useRef(0);
  latest.current = field;
  useLayoutEffect(() => {
    if (field?.key !== baseline.current?.key) {
      revision.current++;
      dirty.current = false;
      setError("");
    }
    if (!dirty.current) {
      baseline.current = field;
      setDraft(field?.value ?? "");
    }
  }, [field, pending]);
  useLayoutEffect(
    () => () => {
      revision.current++;
    },
    [],
  );
  async function apply() {
    const source = baseline.current;
    if (!source || running.current) return;
    const submittedRevision = revision.current;
    running.current = true;
    setPending(true);
    setError("");
    try {
      await commit(source, draft);
      if (
        latest.current?.key === source.key &&
        revision.current === submittedRevision
      ) {
        dirty.current = false;
        baseline.current = { ...source, value: draft };
      }
    } catch (cause) {
      if (
        latest.current?.key === source.key &&
        revision.current === submittedRevision
      ) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      running.current = false;
      setPending(false);
    }
  }
  return {
    draft,
    error,
    pending,
    apply,
    reset() {
      if (running.current) return;
      revision.current++;
      dirty.current = false;
      baseline.current = latest.current;
      setDraft(latest.current?.value ?? "");
      setError("");
    },
    change(value: string) {
      revision.current++;
      dirty.current = true;
      setDraft(value);
      setError("");
    },
  };
}
