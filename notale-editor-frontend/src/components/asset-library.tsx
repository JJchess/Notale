"use client";
import { isComposingKey } from "../keyboard";

import { useState, useSyncExternalStore } from "react";
import { assetLibraryState, type AssetEntry } from "../state/asset-library";
function AssetCard({
  entry,
  selected,
  onSelect,
  onInsert,
}: {
  entry: AssetEntry;
  selected: boolean;
  onSelect: () => void;
  onInsert: () => void;
}) {
  const [failed, setFailed] = useState(false),
    [attempt, setAttempt] = useState(0);
  return (
    <button
      type="button"
      className={"asset-card" + (failed ? " asset-unavailable" : "")}
      data-asset-path={entry.path}
      title={failed ? entry.path + " · 点击重试预览" : entry.path}
      aria-pressed={selected}
      onClick={() => {
        onSelect();
        if (failed) {
          setFailed(false);
          setAttempt((value) => value + 1);
        }
      }}
      onDoubleClick={onInsert}
      onKeyDown={(event) => {
        if (!isComposingKey(event.nativeEvent) && event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          onInsert();
        }
      }}
    >
      {entry.kind === "image" ? (
        <img
          key={attempt}
          src={entry.url}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          hidden={failed}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="asset-symbol">
          {entry.kind === "video" ? "▷" : "♫"}
        </span>
      )}
      <>{failed && <span className="asset-load-error">预览未加载</span>}</>
      <span>{entry.path.split("/").at(-1)}</span>
    </button>
  );
}
export function AssetLibrary({ visible }: { visible: boolean }) {
  const model = useSyncExternalStore(
    assetLibraryState.subscribe,
    assetLibraryState.getSnapshot,
    assetLibraryState.getServerSnapshot,
  );
  const query = model.query.trim().toLocaleLowerCase(),
    entries = model.entries.filter(
      (entry) =>
        entry.path.toLocaleLowerCase().includes(query) &&
        (model.kind === "all" || entry.kind === model.kind),
    );
  const selected = model.entries.find(
    (entry) => entry.path === model.selectedPath,
  );
  const insert = (path: string) => {
    if (model.busy) return;
    model.select?.(path);
    void assetLibraryState.getSnapshot().use?.(false);
  };
  return (
    <section id="media-asset-library" className="asset-library">
      <h3>
        讲义中的素材 <span id="media-asset-count">{model.entries.length}</span>
      </h3>
      <div className="asset-filters">
        <label>
          搜索素材
          <input
            id="media-asset-search"
            type="search"
            placeholder="文件名或目录"
            value={model.query}
            onChange={(event) => model.search?.(event.target.value)}
          />
        </label>
        <label>
          类型
          <select
            id="media-asset-kind"
            value={model.kind}
            onChange={(event) => model.filter?.(event.target.value)}
          >
            <option value="all">全部媒体</option>
            <option value="image">图片</option>
            <option value="video">视频</option>
            <option value="audio">音频</option>
          </select>
        </label>
      </div>
      <div
        id="media-asset-results"
        className="asset-results"
        onKeyDown={(event) => {
          if (
            event.ctrlKey ||
            event.metaKey ||
            event.altKey ||
            event.shiftKey ||
            ![
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
              "End",
            ].includes(event.key)
          )
            return;
          const cards = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                ".asset-card",
              ),
            ],
            index = cards.indexOf(event.target as HTMLButtonElement);
          if (index < 0) return;
          const columns =
            cards.filter(
              (card) => Math.abs(card.offsetTop - cards[0].offsetTop) < 2,
            ).length || 1;
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? cards.length - 1
                : Math.max(
                    0,
                    Math.min(
                      cards.length - 1,
                      index +
                        (({
                          ArrowLeft: -1,
                          ArrowRight: 1,
                          ArrowUp: -columns,
                          ArrowDown: columns,
                        } as Record<string,number>)[event.key] ?? 0),
                    ),
                  );
          event.preventDefault();
          event.stopPropagation();
          cards[next]?.focus();
          const path = cards[next]?.dataset.assetPath;
          if (path) model.select?.(path);
        }}
      >
        {visible &&
          entries
            .slice(0, model.limit)
            .map((entry) => (
              <AssetCard
                key={entry.url + ":" + entry.asset.hash}
                entry={entry}
                selected={entry.path === model.selectedPath}
                onSelect={() => model.select?.(entry.path)}
                onInsert={() => insert(entry.path)}
              />
            ))}
      </div>
      <p id="media-asset-empty" className="hint" hidden={entries.length > 0}>
        没有匹配的素材
      </p>
      <button
        id="media-asset-more"
        className="asset-more"
        hidden={entries.length <= model.limit}
        onClick={() => model.more?.()}
      >
        显示更多
      </button>
      <div
        id="media-asset-actions"
        className="asset-actions"
        hidden={!selected}
      >
        <p id="media-asset-selected-name">{model.selectedPath}</p>
        <button
          id="media-asset-insert"
          disabled={model.busy || !model.use}
          onClick={() => void model.use?.(false)}
        >
          插入到当前页
        </button>
        <button
          id="media-asset-replace"
          title={
            !model.canReplace ? "请先选择同类型的未锁定媒体对象" : undefined
          }
          disabled={model.busy || !model.canReplace}
          onClick={() => void model.use?.(true)}
        >
          替换选中媒体
        </button>
      </div>
      {model.error && <p role="alert">{model.error}</p>}
    </section>
  );
}
