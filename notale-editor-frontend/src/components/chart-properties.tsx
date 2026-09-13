"use client";
import { isComposingKey } from "../keyboard";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  chartPropertiesState,
  type ChartProperty,
  type ChartPropertyField,
} from "../state/chart-properties";
export function NativeChartProperties() {
  const model = useSyncExternalStore(
    chartPropertiesState.subscribe,
    chartPropertiesState.getSnapshot,
    chartPropertiesState.getServerSnapshot,
  );
  return (
    <section
      id="echarts-inspector"
      className="chart-inspector"
      hidden={!model.visible}
    >
      <Properties key={model.key} nodes={model.nodes} locked={model.locked} />
    </section>
  );
}
function Properties({
  nodes,
  locked,
}: {
  nodes: ChartProperty[];
  locked: boolean;
}) {
  return (
    <>
      {nodes.map((node, index) => (
        <Property
          key={`${node.kind}:${"label" in node ? node.label : "title" in node ? node.title : index}`}
          node={node}
          locked={locked}
        />
      ))}
    </>
  );
}
function Property({ node, locked }: { node: ChartProperty; locked: boolean }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    running = useRef(false);
  async function run() {
    if (node.kind !== "button" || running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await node.run();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  if (node.kind === "field") return <Field field={node} locked={locked} />;
  if (node.kind === "text")
    return <p className={node.className}>{node.text}</p>;
  if (node.kind === "group")
    return node.title ? (
      <details className={node.className} open={node.open}>
        <summary>{node.title}</summary>
        <Properties nodes={node.children} locked={locked} />
      </details>
    ) : (
      <div className={node.className}>
        <Properties nodes={node.children} locked={locked} />
      </div>
    );
  return (
    <>
      <button
        type="button"
        title={node.label}
        aria-label={node.label}
        disabled={locked || busy}
        onClick={() => void run()}
      >
        {node.colors
          ? node.colors.map((color, index) => (
              <span key={index} style={{ background: color }} />
            ))
          : node.label}
      </button>
      {error && <p role="status">{error}</p>}
    </>
  );
}
function Field({
  field,
  locked,
}: {
  field: ChartPropertyField;
  locked: boolean;
}) {
  const [value, setValue] = useState(
      field.value == null ? "" : String(field.value),
    ),
    [error, setError] = useState("");
  const focused = useRef(false),
    commit = useRef(field.change),
    composing = useRef(false),
    cancelled = useRef(false);
  useEffect(() => {
    if (!focused.current)
      setValue(field.value == null ? "" : String(field.value));
  }, [field.value]);
  function change(value: unknown, action = field.change) {
    setError("");
    try {
      action(value);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }
  const options = field.options;
  return (
    <label className="chart-field">
      <span>{field.label}</span>
      {options && typeof options === "object" ? (
        <select
          aria-label={field.label}
          disabled={locked}
          value={field.value == null ? "" : String(field.value)}
          onChange={(event) => change(event.target.value)}
        >
          {Object.entries(options).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      ) : options === "checkbox" ? (
        <input
          type="checkbox"
          aria-label={field.label}
          disabled={locked}
          checked={!!field.value}
          onChange={(event) => change(event.target.checked)}
        />
      ) : (
        <input
          type={options ?? "text"}
          aria-label={field.label}
          disabled={locked}
          value={value}
          aria-invalid={!!error}
          step={options === "number" ? "any" : undefined}
          placeholder={options === "number" ? "自动" : undefined}
          onFocus={() => {
            focused.current = true;
            cancelled.current = false;
            commit.current = field.change;
          }}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
          }}
          onChange={(event) => {
            setValue(event.target.value);
            if (options === "color") change(event.target.value);
          }}
          onBlur={(event) => {
            focused.current = false;
            if (cancelled.current) {
              cancelled.current = false;
              return;
            }
            if (composing.current || options === "color") return;
            if (
              options === "number" &&
              (!event.currentTarget.validity.valid ||
                (value !== "" && !Number.isFinite(Number(value))))
            ) {
              setError("请输入有效数值，或留空使用自动设置");
              return;
            }
            if (value === (field.value == null ? "" : String(field.value)))
              return;
            change(
              options === "number"
                ? value === ""
                  ? null
                  : Number(value)
                : value,
              commit.current,
            );
          }}
          onKeyDown={(event) => {
            if (composing.current || isComposingKey(event.nativeEvent)) return;
            if (event.key === "Escape" && options !== "color") {
              event.preventDefault();
              event.stopPropagation();
              cancelled.current = true;
              setValue(field.value == null ? "" : String(field.value));
              setError("");
              event.currentTarget.blur();
            } else if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
      )}
      {error && <span role="status">{error}</span>}
    </label>
  );
}
