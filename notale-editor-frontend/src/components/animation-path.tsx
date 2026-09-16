"use client";
import { isComposingKey } from "../keyboard";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  animationPathState,
  motionPresets,
  updateMotionPath,
  type PathPoint,
  type MotionPath,
} from "../state/animation-path";
function bounds(points: PathPoint[]) {
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y),
    x = Math.min(0, ...xs) - 50,
    y = Math.min(0, ...ys) - 50;
  return {
    x,
    y,
    w: Math.max(160, Math.max(0, ...xs) - x + 50),
    h: Math.max(120, Math.max(0, ...ys) - y + 50),
  };
}
export function AnimationPath({ disabled }: { disabled: boolean }) {
  const source = useSyncExternalStore(
    animationPathState.subscribe,
    animationPathState.getSnapshot,
    animationPathState.getServerSnapshot,
  );
  const [preview, setPreview] = useState<PathPoint[]>(),
    [error, setError] = useState("");
  const svg = useRef<SVGSVGElement>(null),
    drag = useRef<
      | {
          source: MotionPath;
          index: number;
          pointer: number;
          points: PathPoint[];
          box: ReturnType<typeof bounds>;
        }
      | undefined
    >(undefined);
  function cancel() {
    const active = drag.current;
    drag.current = undefined;
    setPreview(undefined);
    if (active && svg.current?.hasPointerCapture(active.pointer))
      svg.current.releasePointerCapture(active.pointer);
  }
  useEffect(() => {
    cancel();
  }, [source, disabled]);
  const points = preview ?? source.points,
    box = drag.current?.box ?? bounds(points),
    size = Math.max(box.w, box.h) / 45;
  function commit(value: PathPoint[], preset = "custom", captured = source) {
    if (disabled) return;
    try {
      updateMotionPath(captured, value, preset);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }
  return (
    <>
      <summary>编辑运动路径</summary>
      <label>
        路径
        <select
          data-path-preset
          value={source.preset}
          onChange={(event) => {
            const preset = event.target.value;
            if (motionPresets[preset]) commit(motionPresets[preset], preset);
          }}
        >
          <option value="line">直线</option>
          <option value="arc">弧线</option>
          <option value="zigzag">折线</option>
          <option value="custom">自定义</option>
        </select>
      </label>
      <svg
        ref={svg}
        className="motion-path-canvas"
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        aria-label="拖动控制点调整运动路径"
        tabIndex={0}
        onPointerDown={(event) => {
          const target = event.target as SVGElement,
            index = Number(target.dataset.point);
          if (
            disabled ||
            target.dataset.point === undefined ||
            index === 0 ||
            event.button !== 0
          )
            return;
          drag.current = {
            source,
            index,
            pointer: event.pointerId,
            points: structuredClone(source.points),
            box: bounds(source.points),
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.focus();
          event.preventDefault();
        }}
        onPointerMove={(event) => {
          const active = drag.current;
          if (!active || active.pointer !== event.pointerId || disabled) return;
          const matrix = event.currentTarget.getScreenCTM();
          if (!matrix) return;
          const point = new DOMPoint(
            event.clientX,
            event.clientY,
          ).matrixTransform(matrix.inverse());
          active.points = active.points.map((p, i) =>
            i === active.index
              ? { x: Math.round(point.x), y: Math.round(point.y) }
              : p,
          );
          setPreview(active.points);
        }}
        onPointerUp={(event) => {
          const active = drag.current;
          if (!active || active.pointer !== event.pointerId) return;
          cancel();
          commit(active.points, "custom", active.source);
        }}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
        onKeyDown={(event) => {
          if (isComposingKey(event.nativeEvent)) return;
          if (event.key === "Escape" && drag.current) {
            event.preventDefault();
            event.stopPropagation();
            cancel();
          }
        }}
      >
        <path
          d={points.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ")}
          fill="none"
          stroke="#946bcc"
          strokeWidth={size / 3}
          strokeDasharray={`${size / 2} ${size / 2}`}
        />
        {points.map((p, i) => (
          <circle
            key={i}
            data-point={i}
            cx={p.x}
            cy={p.y}
            r={size}
            fill={i ? "#946bcc" : "#3a9b73"}
            stroke="white"
            strokeWidth={size / 3}
          />
        ))}
      </svg>
      <div data-path-points>
        {source.points.map((point, index) => (
          <div className="motion-path-point" key={index}>
            <span>
              {index === 0
                ? "起点"
                : index === source.points.length - 1
                  ? "终点"
                  : index}
            </span>
            {(["x", "y"] as const).map((axis) => (
              <Coordinate
                key={axis}
                source={source}
                index={index}
                axis={axis}
                disabled={disabled || index === 0}
                commit={commit}
              />
            ))}
            <button
              type="button"
              data-remove-point={index}
              title="删除控制点"
              aria-label="删除控制点"
              disabled={disabled || index === 0 || source.points.length <= 2}
              onClick={() =>
                commit(source.points.filter((_, i) => i !== index))
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        data-path-add
        disabled={disabled || source.points.length >= 50}
        onClick={() => {
          const end = source.points.at(-1)!;
          commit([...source.points, { x: end.x + 60, y: end.y }]);
        }}
      >
        ＋ 控制点
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
function Coordinate({
  source,
  index,
  axis,
  disabled,
  commit,
}: {
  source: MotionPath;
  index: number;
  axis: "x" | "y";
  disabled: boolean;
  commit: (value: PathPoint[], preset?: string, captured?: MotionPath) => void;
}) {
  const [value, setValue] = useState(String(source.points[index][axis]));
  const focused = useRef(false),
    captured = useRef(source),
    dirty = useRef(false);
  useEffect(() => {
    if (!focused.current) setValue(String(source.points[index][axis]));
  }, [source, index, axis]);
  return (
    <label>
      {axis.toUpperCase()}
      <input
        type="number"
        required
        data-axis={axis}
        data-index={index}
        disabled={disabled}
        value={value}
        onFocus={() => {
          focused.current = true;
          captured.current = source;
        }}
        onChange={(event) => {
          setValue(event.target.value);
          dirty.current = true;
        }}
        onBlur={(event) => {
          focused.current = false;
          if (!dirty.current) {
            setValue(String(source.points[index][axis]));
            return;
          }
          if (!event.currentTarget.reportValidity()) return;
          dirty.current = false;
          commit(
            captured.current.points.map((p, i) =>
              i === index ? { ...p, [axis]: Number(value) } : p,
            ),
            "custom",
            captured.current,
          );
        }}
        onKeyDown={(event) => {
          if (isComposingKey(event.nativeEvent)) return;
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            dirty.current = false;
            setValue(String(source.points[index][axis]));
            event.currentTarget.blur();
          } else if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}
