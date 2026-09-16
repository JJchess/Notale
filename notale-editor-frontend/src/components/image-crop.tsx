"use client";
import { isComposingKey } from "../keyboard";

import {
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import {
  imageCropState,
  imageCropActions,
  type CropEditing,
} from "../state/image-crop-editor";
import {
  cropEdges,
  moveCrop,
  nudgeCrop,
  type Crop,
  type CropEdge,
} from "../state/image-crop";
function useCrop() {
  return useSyncExternalStore(
    imageCropState.subscribe,
    imageCropState.getSnapshot,
    imageCropState.getServerSnapshot,
  );
}
export function ImageCropButton() {
  const model = useCrop();
  const [error, setError] = useState("");
  return (
    <>
      <button
        id="open-image-crop"
        hidden={!model.available}
        disabled={model.locked || model.unsupported}
        title={
          model.unsupported
            ? "当前图片使用自定义取景，暂不支持矩形裁剪"
            : undefined
        }
        onClick={() => {
          try {
            setError("");
            imageCropActions.open();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }}
      >
        裁剪图片
      </button>
      {model.available && error && <p role="alert">{error}</p>}
    </>
  );
}
export function ImageCropDialog() {
  const { editing } = useCrop();
  return editing ? <CropDialog key={editing.id} editing={editing} /> : null;
}
function CropDialog({ editing }: { editing: CropEditing }) {
  const [settings, setSettings] = useState(editing.settings),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    stage = useRef<HTMLDivElement>(null),
    running = useRef(false);
  const drag = useRef<
    | {
        x: number;
        y: number;
        edge?: CropEdge;
        crop: Crop;
        width: number;
        height: number;
        pointerId: number;
        element: HTMLDivElement;
      }
    | undefined
  >(undefined);
  useLayoutEffect(() => {
    const node = dialog.current!;
    node.showModal();
    return () => {
      drag.current = undefined;
      node.close();
    };
  }, []);
  function finishDrag(commit: boolean, pointerId?: number) {
    const d = drag.current;
    if (!d || (pointerId !== undefined && pointerId !== d.pointerId)) return;
    drag.current = undefined;
    if (!commit) setSettings((s) => ({ ...s, crop: d.crop }));
    if (d.element.hasPointerCapture(d.pointerId))
      d.element.releasePointerCapture(d.pointerId);
  }
  const close = () => {
    if (!running.current) imageCropActions.close();
  };
  async function save() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await imageCropActions.save(editing.id, settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  const { crop } = settings,
    opposite = {
      top: "bottom",
      bottom: "top",
      left: "right",
      right: "left",
    } as const;
  return (
    <dialog
      ref={dialog}
      id="image-crop-dialog"
      aria-labelledby="crop-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (isComposingKey(e.nativeEvent)) return;
        if (e.key === "Escape" && drag.current) {
          e.preventDefault();
          finishDrag(false);
        } else if (
          e.key === "Enter" &&
          (e.ctrlKey || e.metaKey) &&
          !drag.current
        ) {
          e.preventDefault();
          void save();
        }
      }}
    >
      <header>
        <h2 id="crop-title">调整图片取景</h2>
        <button
          id="close-image-crop"
          aria-label="关闭图片裁剪"
          disabled={busy}
          onClick={close}
        >
          ×
        </button>
      </header>
      <div
        ref={stage}
        id="crop-stage"
        style={
          {
            aspectRatio: String(editing.ratio),
            "--crop-ratio": String(editing.ratio),
          } as CSSProperties
        }
      >
        <img
          id="crop-preview"
          alt="裁剪预览"
          src={editing.src}
          draggable={false}
          style={{
            objectFit: settings.fit,
            objectPosition: `${settings.positionX}% ${settings.positionY}%`,
          }}
        />
        <div
          id="crop-box"
          style={{
            inset: `${crop.top}% ${crop.right}% ${crop.bottom}% ${crop.left}%`,
          }}
          onPointerDown={(e) => {
            if (busy || e.button !== 0 || drag.current) return;
            const bounds = stage.current!.getBoundingClientRect();
            drag.current = {
              pointerId: e.pointerId,
              element: e.currentTarget,
              x: e.clientX,
              y: e.clientY,
              edge: (e.target as HTMLElement).dataset.cropEdge as
                | CropEdge
                | undefined,
              crop: { ...crop },
              width: bounds.width,
              height: bounds.height,
            };
            e.currentTarget.setPointerCapture(e.pointerId);
            e.preventDefault();
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || busy || e.pointerId !== d.pointerId) return;
            setSettings((s) => ({
              ...s,
              crop: moveCrop(
                d.crop,
                ((e.clientX - d.x) / d.width) * 100,
                ((e.clientY - d.y) / d.height) * 100,
                d.edge,
              ),
            }));
          }}
          onPointerUp={(e) => finishDrag(true, e.pointerId)}
          onPointerCancel={(e) => finishDrag(false, e.pointerId)}
          onLostPointerCapture={(e) => finishDrag(false, e.pointerId)}
        >
          {cropEdges.map((edge) => (
            <button
              key={edge}
              data-crop-edge={edge}
              disabled={busy}
              aria-label={
                "裁剪" +
                { top: "上", right: "右", bottom: "下", left: "左" }[edge] +
                "边"
              }
              role="slider"
              aria-valuemin={0}
              aria-valuemax={99 - crop[opposite[edge]]}
              aria-valuenow={Math.round(crop[edge])}
              aria-orientation={
                edge === "top" || edge === "bottom" ? "vertical" : "horizontal"
              }
              onKeyDown={(e) => {
                const next = nudgeCrop(crop, edge, e.key, e.shiftKey);
                if (next) {
                  e.preventDefault();
                  setSettings((s) => ({ ...s, crop: next }));
                }
              }}
            />
          ))}
        </div>
      </div>
      <div className="field-grid">
        <label>
          水平取景
          <input
            id="crop-focus-x"
            type="range"
            min="0"
            max="100"
            disabled={busy}
            value={settings.positionX}
            onChange={(e) =>
              setSettings({ ...settings, positionX: Number(e.target.value) })
            }
          />
        </label>
        <label>
          垂直取景
          <input
            id="crop-focus-y"
            type="range"
            min="0"
            max="100"
            disabled={busy}
            value={settings.positionY}
            onChange={(e) =>
              setSettings({ ...settings, positionY: Number(e.target.value) })
            }
          />
        </label>
        <label>
          图片适应
          <select
            id="crop-fit"
            disabled={busy}
            value={settings.fit}
            onChange={(e) =>
              setSettings({
                ...settings,
                fit: e.target.value as typeof settings.fit,
              })
            }
          >
            {[
              ["contain", "完整适应"],
              ["cover", "裁切填充"],
              ["fill", "拉伸"],
              ["none", "原始尺寸"],
              ["scale-down", "仅缩小"],
            ].map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p id="crop-status" role="status">
        {error}
      </p>
      <footer>
        <button
          id="reset-image-crop"
          disabled={busy}
          onClick={() =>
            setSettings({
              ...settings,
              crop: { top: 0, right: 0, bottom: 0, left: 0 },
              positionX: 50,
              positionY: 50,
            })
          }
        >
          重置裁剪
        </button>
        <button
          id="save-image-crop"
          className="primary"
          disabled={busy}
          onClick={() => void save()}
        >
          保存裁剪
        </button>
      </footer>
    </dialog>
  );
}
