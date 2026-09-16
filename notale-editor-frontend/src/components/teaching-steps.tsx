"use client";
import { isComposingKey } from "../keyboard";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimationIcon } from "./animation-icon";
import { teachingStepsState } from "../state/teaching-steps";
export function TeachingSteps() {
  const model = useSyncExternalStore(
      teachingStepsState.subscribe,
      teachingStepsState.getSnapshot,
      teachingStepsState.getServerSnapshot,
    ),
    drag = useRef<{ id: string; scope: string } | undefined>(undefined),
    [drop, setDrop] = useState<{ id: string; after: boolean }>();
  useEffect(() => {
    drag.current = undefined;
    setDrop(undefined);
  }, [model.scope]);
  const run = (action: string) => void model.run?.(action);
  const before = useRef("");
  const fieldKeys: Record<string, "name" | "notes" | "advance"> = {
    "teaching-name": "name",
    "teaching-notes": "notes",
    "teaching-advance": "advance",
  };
  const fieldFocus = (
    event: import("react").FocusEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    before.current = event.currentTarget.value;
  };
  const fieldKeyboard = (
    event: import("react").KeyboardEvent<
      HTMLInputElement | HTMLTextAreaElement
    >,
  ) => {
    if (isComposingKey(event.nativeEvent)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      const key = fieldKeys[event.currentTarget.id];
      if (key) model.change?.({ [key]: before.current });
    } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.stopPropagation();
      run("save");
    }
  };

  return (
    <fieldset
      id="teaching-steps"
      disabled={model.busy || !model.ready}
      aria-busy={model.busy}
    >
      <legend>讲授步骤</legend>
      <button
        id="teaching-initialize"
        hidden={model.initialized}
        onClick={() => run("initialize")}
      >
        编辑步骤与讲稿
      </button>
      <div id="teaching-step-controls" hidden={!model.initialized}>
        <div
          id="teaching-order"
          className="teaching-order"
          aria-label="讲授顺序"
        >
          {model.cards.map((card, index) => (
            <button
              key={card.id}
              type="button"
              className={
                "teaching-card" +
                (drop?.id === card.id
                  ? drop.after
                    ? " step-drop-after"
                    : " step-drop-before"
                  : "")
              }
              data-step-id={card.id}
              draggable={index > 0 && !model.busy}
              aria-pressed={card.id === model.selected}
              onClick={() => model.choose?.(card.id)}
              onKeyDown={(event) => {
                if (
                  isComposingKey(event.nativeEvent) ||
                  event.altKey ||
                  event.ctrlKey ||
                  event.metaKey
                )
                  return;
                const at =
                  event.key === "ArrowDown"
                    ? Math.min(model.cards.length - 1, index + 1)
                    : event.key === "ArrowUp"
                      ? Math.max(0, index - 1)
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? model.cards.length - 1
                          : -1;
                if (at < 0) return;
                event.preventDefault();
                event.stopPropagation();
                model.choose?.(model.cards[at].id);
                event.currentTarget.parentElement
                  ?.querySelectorAll<HTMLButtonElement>(".teaching-card")
                  [at]?.focus();
              }}
              onDragStart={(event) => {
                if (index === 0 || model.busy) {
                  event.preventDefault();
                  return;
                }
                drag.current = { id: card.id, scope: model.scope };
                event.dataTransfer.setData(
                  "application/x-notale-step",
                  card.id,
                );
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => {
                if (
                  !drag.current ||
                  drag.current.scope !== model.scope ||
                  model.busy
                )
                  return;
                event.preventDefault();
                const rect = event.currentTarget.getBoundingClientRect();
                setDrop({
                  id: card.id,
                  after: event.clientY > rect.top + rect.height / 2,
                });
              }}
              onDrop={(event) => {
                const source = drag.current;
                drag.current = undefined;
                setDrop(undefined);
                if (!source || source.scope !== model.scope || model.busy)
                  return;
                event.preventDefault();
                const rect = event.currentTarget.getBoundingClientRect();
                void model.move?.(
                  source.id,
                  card.id,
                  event.clientY > rect.top + rect.height / 2,
                );
              }}
              onDragEnd={() => {
                drag.current = undefined;
                setDrop(undefined);
              }}
            >
              <span className="teaching-number">{index}</span>
              <span>
                <strong>{card.name}</strong>
                <small>{card.detail}</small>
              </span>
            </button>
          ))}
        </div>
        <label className="sr-only">
          步骤
          <select
            id="teaching-step"
            value={model.selected}
            onChange={(event) => model.choose?.(event.target.value)}
          >
            {model.cards.map((card, index) => (
              <option key={card.id} value={card.id}>
                {index} · {card.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          步骤名称
          <input
            id="teaching-name"
            onFocus={fieldFocus}
            onKeyDown={fieldKeyboard}
            maxLength={200}
            value={model.draft.name}
            onChange={(event) => model.change?.({ name: event.target.value })}
          />
        </label>
        <label>
          本步骤讲稿
          <textarea
            id="teaching-notes"
            onFocus={fieldFocus}
            onKeyDown={fieldKeyboard}
            rows={4}
            value={model.draft.notes}
            onChange={(event) => model.change?.({ notes: event.target.value })}
          />
        </label>
        <label>
          自动前进（秒）
          <input
            id="teaching-advance"
            onFocus={fieldFocus}
            onKeyDown={fieldKeyboard}
            type="number"
            min={0}
            max={3600}
            step="0.1"
            placeholder="留空继承页面，0 表示手动"
            value={model.draft.advance}
            onChange={(event) =>
              model.change?.({ advance: event.target.value })
            }
          />
        </label>
        <button id="teaching-save" onClick={() => run("save")}>
          保存步骤信息
        </button>
        <div className="teaching-actions" role="group" aria-label="步骤操作">
          <button
            id="teaching-preview"
            title="预览当前步骤"
            aria-label="预览当前步骤"
            onClick={() => run("preview")}
          >
            <AnimationIcon name="play" />
          </button>
          <button id="teaching-insert" onClick={() => run("insert")}>
            插入步骤
          </button>
          <button
            id="teaching-duplicate"
            title="复制当前步骤及动画"
            aria-label="复制当前步骤及动画"
            onClick={() => run("duplicate")}
          >
            <AnimationIcon name="copy" />
          </button>
          <button
            id="teaching-remove"
            title="删除当前步骤"
            aria-label="删除当前步骤"
            disabled={model.index <= 0}
            onClick={() => run("remove")}
          >
            <AnimationIcon name="trash" />
          </button>
          <button
            id="teaching-up"
            title="提前一步"
            aria-label="提前一步"
            disabled={model.index <= 1}
            onClick={() => run("up")}
          >
            <AnimationIcon name="up" />
          </button>
          <button
            id="teaching-down"
            title="推后一步"
            aria-label="推后一步"
            disabled={
              model.index <= 0 || model.index === model.cards.length - 1
            }
            onClick={() => run("down")}
          >
            <AnimationIcon name="down" />
          </button>
        </div>
      </div>
      {model.error && <p role="alert">{model.error}</p>}
    </fieldset>
  );
}
