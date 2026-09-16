"use client";
import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import {
  animationListState,
  type AnimationListModel,
} from "../state/animation-list";
import { AnimationIcon } from "./animation-icon";
import { AnimationTiming } from "./animation-timing";
function useModel() {
  return useSyncExternalStore(
    animationListState.subscribe,
    animationListState.getSnapshot,
    animationListState.getServerSnapshot,
  );
}
function run(model: AnimationListModel, action: () => unknown) {
  if (model.current())
    void Promise.resolve()
      .then(() => {
        if (model.current()) return action();
      })
      .catch(model.error);
}
export function AnimationTimeline() {
  const model = useModel();
  return (
    <div id="timeline" className="timeline">
      {model?.rows.map((row) => (
        <button
          key={row.id}
          className="cue"
          data-edit-animation={row.id}
          onClick={() => run(model, () => model.edit(row.id))}
        >
          {row.summary}
        </button>
      ))}
    </div>
  );
}
export function AnimationList() {
  const model = useModel(),
    [dropTarget, setDropTarget] = useState<string | undefined>();
  useLayoutEffect(() => () => model?.focus?.(false), [model?.focus]);
  return (
    <div
      id="animations"
      tabIndex={0}
      onFocusCapture={() => model?.focus?.(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          model?.focus?.(false);
      }}
    >
      {model?.rows.length ? (
        model.rows.map((row, index) => (
          <div
            key={row.id}
            className={`animation-row ${row.selected ? "is-selected" : ""} ${dropTarget === row.id ? "drag-target" : ""}`}
            data-cue-id={row.id}
            onKeyDown={(event) => {
              let action: (() => unknown) | undefined;
              if (event.key === "Delete" || event.key === "Backspace")
                action = () => model.remove(row.id);
              else if (
                (event.ctrlKey || event.metaKey) &&
                event.key.toLowerCase() === "d"
              )
                action = () => model.copy(row.id);
              else if (
                ["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key) &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.shiftKey
              ) {
                const direction = event.key === "ArrowUp" ? -1 : 1;
                if (
                  event.altKey &&
                  ["ArrowUp", "ArrowDown"].includes(event.key)
                ) {
                  if (direction === -1 ? row.up : row.down)
                    action = () => model.move(row.id, direction);
                } else if (!event.altKey) {
                  const target =
                    event.key === "Home"
                      ? event.currentTarget.parentElement?.firstElementChild
                      : event.key === "End"
                        ? event.currentTarget.parentElement?.lastElementChild
                        : direction === -1
                          ? event.currentTarget.previousElementSibling
                          : event.currentTarget.nextElementSibling;
                  const button =
                    target?.querySelector<HTMLButtonElement>(
                      ".animation-object",
                    );
                  if (button) {
                    button.focus();
                    const id = button.dataset.editAnimation;
                    if (id) action = () => model.edit(id);
                  }
                }
              }
              if (
                action ||
                [
                  "Delete",
                  "Backspace",
                  "ArrowUp",
                  "ArrowDown",
                  "Home",
                  "End",
                ].includes(event.key) ||
                ((event.ctrlKey || event.metaKey) &&
                  event.key.toLowerCase() === "d")
              ) {
                event.preventDefault();
                event.stopPropagation();
                if (action) run(model, action);
              }
            }}
            onDragOver={(event) => {
              if (
                event.dataTransfer.types.includes(
                  "application/notale-animation",
                )
              ) {
                event.preventDefault();
                setDropTarget(row.id);
              }
            }}
            onDragLeave={() => setDropTarget(undefined)}
            onDrop={(event) => {
              event.preventDefault();
              setDropTarget(undefined);
              const id = event.dataTransfer.getData(
                "application/notale-animation",
              );
              if (id && id !== row.id) run(model, () => model.drop(id, row.id));
            }}
          >
            <div className="animation-row-heading">
              <button
                className="animation-grip"
                draggable
                data-drag-animation={row.id}
                title="拖动调整顺序"
                aria-label="拖动调整顺序"
                onDragEnd={() => setDropTarget(undefined)}
                onDragStart={(event) => {
                  event.dataTransfer.setData(
                    "application/notale-animation",
                    row.id,
                  );
                  event.dataTransfer.effectAllowed = "move";
                }}
              >
                <AnimationIcon name="grip" />
              </button>
              <button
                className="animation-object"
                aria-pressed={row.selected}
                data-edit-animation={row.id}
                onClick={() => run(model, () => model.edit(row.id))}
              >
                <span className="animation-number">{index + 1}</span>
                {row.label}
              </button>
            </div>
            <span className="animation-description">{row.description}</span>
            <div className="animation-time-label">{row.timing}</div>
            <AnimationTiming row={row} model={model} />
            <div className="animation-actions">
              <button
                data-preview-animation={row.id}
                title="预览此动画"
                aria-label="预览此动画"
                onClick={() => run(model, () => model.preview(row.id))}
              >
                <AnimationIcon name="play" />
              </button>
              <button
                data-copy-animation={row.id}
                title="复制动画"
                aria-label="复制动画"
                onClick={() => run(model, () => model.copy(row.id))}
              >
                <AnimationIcon name="copy" />
              </button>
              <button
                data-remove-animation={row.id}
                title="删除动画"
                aria-label="删除动画"
                onClick={() => run(model, () => model.remove(row.id))}
              >
                <AnimationIcon name="trash" />
              </button>
              <span className="grow" />
              <button
                data-up-animation={row.id}
                title="上移"
                aria-label="上移动画"
                disabled={!row.up}
                onClick={() => run(model, () => model.move(row.id, -1))}
              >
                <AnimationIcon name="up" />
              </button>
              <button
                data-down-animation={row.id}
                title="下移"
                aria-label="下移动画"
                disabled={!row.down}
                onClick={() => run(model, () => model.move(row.id, 1))}
              >
                <AnimationIcon name="down" />
              </button>
            </div>
          </div>
        ))
      ) : null}
    </div>
  );
}
