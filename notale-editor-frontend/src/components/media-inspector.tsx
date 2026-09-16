"use client";
import { isComposingKey } from "../keyboard";

import { useRef, useSyncExternalStore } from "react";
import { mediaInspectorState, type MediaDraft } from "../state/media-inspector";
export function MediaInspector() {
  const model = useSyncExternalStore(
      mediaInspectorState.subscribe,
      mediaInspectorState.getSnapshot,
      mediaInspectorState.getServerSnapshot,
    ),
    draft = model.draft;
  const focusedDraft = useRef<
    { scope: string; key: keyof MediaDraft; value: string } | undefined
  >(undefined);
  const custom = (key: keyof MediaDraft) =>
    (["positionX", "positionY"].includes(key) && model.customPosition) ||
    (["top", "right", "bottom", "left"].includes(key) && model.customCrop);
  const number = (
    key: keyof MediaDraft,
    id: string,
    label: string,
    min?: number,
    max?: number,
    step = "any",
  ) => (
    <label key={key}>
      {label}
      <input
        id={id}
        type="number"
        data-media-field={key}
        placeholder={
          custom(key)
            ? "自定义"
            : key === "endAt"
              ? "片尾"
              : key === "startStep"
                ? "手动"
                : undefined
        }
        min={min}
        max={max}
        step={step}
        disabled={custom(key)}
        title={custom(key) ? "使用自定义样式，暂不支持百分比编辑" : undefined}
        value={custom(key) ? "" : String(draft?.[key] ?? "")}
        onChange={(e) => model.change?.({ [key]: e.target.value })}
      />
    </label>
  );
  return (
    <div id="media-inspector-mount">
      <fieldset
        id="media-panel"
        hidden={!model.tag}
        disabled={model.busy || model.locked}
        onFocus={(event) => {
          const input = event.target;
          if (!(input instanceof HTMLInputElement)) return;
          const key = input.dataset.mediaField as keyof MediaDraft | undefined;
          if (key)
            focusedDraft.current = {
              scope: model.scope,
              key,
              value: input.value,
            };
        }}
        onKeyDown={(event) => {
          if (
            isComposingKey(event.nativeEvent) ||
            !(event.target instanceof HTMLInputElement) ||
            !event.target.dataset.mediaField
          )
            return;
          if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            void model.save?.();
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            const initial = focusedDraft.current;
            if (
              initial?.scope === model.scope &&
              initial.key === event.target.dataset.mediaField
            )
              model.change?.({ [initial.key]: initial.value });
            event.target.blur();
          }
        }}
      >
        <legend>媒体</legend>
        <div className="inline">
          <button id="replace-media" onClick={() => model.replace?.(false)}>
            替换文件
          </button>
          <button
            id="replace-poster"
            hidden={model.tag !== "video"}
            onClick={() => model.replace?.(true)}
          >
            替换视频封面
          </button>
        </div>
        <label hidden={model.tag !== "img"}>
          图片说明
          <input
            id="media-alt"
            data-media-field="alt"
            value={draft?.alt ?? ""}
            onChange={(e) => model.change?.({ alt: e.target.value })}
          />
        </label>
        <div hidden={model.tag === "audio"}>
          <label>
            取景
            <select
              id="media-fit"
              value={draft?.fit ?? "contain"}
              onChange={(e) => model.change?.({ fit: e.target.value })}
            >
              {Object.entries({
                contain: "完整适应",
                cover: "裁切填充",
                fill: "拉伸",
                none: "原始尺寸",
                "scale-down": "仅缩小",
              }).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="field-grid">
            {number("positionX", "media-x", "水平焦点 %", 0, 100)}
            {number("positionY", "media-y", "垂直焦点 %", 0, 100)}
            {(["top", "right", "bottom", "left"] as const).map((edge, i) =>
              number(
                edge,
                "crop-" + edge,
                "裁去" + ["上", "右", "下", "左"][i] + "边 %",
                0,
                99,
              ),
            )}
          </div>
        </div>
        <div id="media-playback" hidden={model.tag === "img"}>
          <div className="field-grid">
            {number("startAt", "media-start", "开始时间（秒）", 0, 86400, ".1")}
            {number("endAt", "media-end", "结束时间（秒）", 0, 86400, ".1")}
            {number("volume", "media-volume", "音量 %", 0, 100, "5")}
            {number("rate", "media-rate", "播放速度（倍）", 0.25, 4, ".25")}
            {number("startStep", "media-step", "开始步骤", 0, 500, "1")}
          </div>
          {(
            [
              ["muted", "静音"],
              ["loop", "循环选定区间"],
              ["controls", "显示播放控件"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              <input
                id={"media-" + key}
                type="checkbox"
                checked={draft?.[key] ?? false}
                onChange={(e) => model.change?.({ [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
        </div>
        <button
          id="save-media"
          disabled={!draft}
          onClick={() => void model.save?.()}
        >
          保存媒体设置
        </button>
        <p id="media-notice" role="status" hidden={!model.notice}>
          {model.notice}
        </p>
        {model.error && <p role="alert">{model.error}</p>}
      </fieldset>
    </div>
  );
}
