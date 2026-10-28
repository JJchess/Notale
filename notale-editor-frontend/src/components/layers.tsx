"use client";
import {useI18n} from '../i18n/react';

import { isComposingKey } from "../keyboard";

import { memo, useLayoutEffect, useRef, useState } from "react";
import { editorSession, editorActions } from "../state/editor-session";
import type { NameFieldState } from "../state/inspector";
import type { LayerRow, LayerState } from "../state/layers";
import { useEditorSelector } from "../state/use-editor-selector";
import './layers-reorder.css';
function LayerName({
  field,
  label,
  done,
}: {
  field: NameFieldState;
  label: string;
  done: (restore: boolean) => void;
}) {
 const t=useI18n();

  const initial = field.value || label;
  const [value, setValue] = useState(initial),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    running = useRef(false),
    cancelled = useRef(false);
  useLayoutEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const save = async (restore = true) => {
    if (running.current || cancelled.current) return;
    if (value === initial) {
      done(restore);
      return;
    }
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await editorActions.saveObjectName(field, value);
      done(restore);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="layer-name-edit">
      <input
        ref={input}
        aria-label={t("图层名称")}
        value={value}
        disabled={busy}
        placeholder={label}
        onChange={(event) => {
          setValue(event.target.value);
          setError("");
        }}
        onBlur={() => void save(false)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (isComposingKey(event.nativeEvent)) return;
          if (event.key === "Enter") {
            event.preventDefault();
            void save();
          } else if (event.key === "Escape") {
            event.preventDefault();
            cancelled.current = true;
            done(true);
          }
        }}
      />
      {error && <span role="alert">{t(error)}</span>}
    </div>
  );
}
const LayerButton = memo(function LayerButton({
  row,
  source,
  selected,
}: {
  row: LayerRow;
  source: LayerState;
  selected: boolean;
}) {
  const t=useI18n();
  const [renaming, setRenaming] = useState<NameFieldState>();
  const button = useRef<HTMLButtonElement>(null),
    restore = useRef(false);
  useLayoutEffect(() => {
    if (!renaming && restore.current) {
      restore.current = false;
      button.current?.focus();
    }
  }, [renaming]);
  const rename = () => {
    if (row.locked) return;
    editorActions.selectLayer(source, row.id, false);
    const field = editorSession.getSnapshot().nameField;
    if (
      field?.editable &&
      field.targets.length === 1 &&
      field.targets[0] === row.id
    )
      setRenaming(field);
  };
  if (renaming)
    return (
      <LayerName
        field={renaming}
        label={row.label}
        done={(focus) => {
          restore.current = focus;
          setRenaming(undefined);
        }}
      />
    );
  return (
    <button
      ref={button}
      draggable={!!source.reorder&&!row.locked}
      onDoubleClick={rename}
      onKeyDown={(event) => {
        if(event.altKey&&!event.ctrlKey&&!event.metaKey&&['ArrowUp','ArrowDown'].includes(event.key)&&source.reorder){
          event.preventDefault();event.stopPropagation();
          const siblings=source.rows.filter(item=>item.parent===row.parent),index=siblings.findIndex(item=>item.id===row.id),target=siblings[index+(event.key==='ArrowUp'?-1:1)];
          if(target)void source.reorder([row.id],target.id,event.key==='ArrowUp'?'before':'after').catch(editorActions.reportError);
          return;
        }
        if (
          event.key === "F2" &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
        ) {
          event.preventDefault();
          event.stopPropagation();
          rename();
        }
      }}
      className={"object-row" + (selected ? " selected" : "")}
      data-object={row.id}
      style={{ paddingLeft: 8 + row.depth * 8 }}
      title={row.title}
      aria-pressed={selected}
      onClick={(event) =>
        editorActions.selectLayer(
          source,
          row.id,
          event.shiftKey || event.ctrlKey || event.metaKey,
        )
      }
    >
      <svg className="layer-kind-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {/^(h[1-6]|p|span|text|tspan|a|label)$/i.test(row.tag) ? <path d="M5 5h14M12 5v14M8 19h8"/> : /^(img|image|video)$/i.test(row.tag) ? <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1"/><path d="m3 17 6-5 4 3 3-2 5 4"/></> : /^(g|div|main|section)$/i.test(row.tag) ? <><rect x="4" y="4" width="16" height="16" rx="2" strokeDasharray="3 3"/></> : <rect x="5" y="5" width="14" height="14" rx="2"/>}
      </svg>
      <span className="layer-label">{row.label}</span>
      {row.locked && <svg className="layer-lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" role="img" aria-label={t("已锁定")}><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>}
    </button>
  );
});
export function Layers() {
 const t=useI18n();

  const list = useRef<HTMLDivElement>(null);
  const dragging=useRef<{source:LayerState;ids:string[]}|undefined>(undefined);
  const [drop,setDrop]=useState<{id:string;placement:'before'|'after'}>();
  const source = useEditorSelector((state) => state.layers),
    query = useEditorSelector((state) => state.objectQuery),
    selected = useEditorSelector((state) => state.selectedIds);
  const search = query.trim().toLocaleLowerCase(),
    ids = new Set(selected),
    rows =
      source?.rows.filter((row) => !search || row.search.includes(search)) ??
      [];
  return (
    <>
      <label>{t("查找对象")}<input
          id="object-search"
          type="search"
          autoComplete="off"
          onKeyDown={(event) => {
            if (isComposingKey(event.nativeEvent)) return;
            if (event.key === "Escape" && query) {
              event.preventDefault();
              event.stopPropagation();
              editorSession.update({ objectQuery: "" });
            } else if (
              (event.key === "Enter" || event.key === "ArrowDown") &&
              source &&
              rows.length
            ) {
              event.preventDefault();
              event.stopPropagation();
              editorActions.selectLayer(source, rows[0].id, false);
              list.current
                ?.querySelector<HTMLButtonElement>("button[data-object]")
                ?.focus();
            }
          }}
          placeholder={t("名称、文字或类型")}
          value={query}
          onChange={(event) =>
            editorSession.update({ objectQuery: event.target.value })
          }
        />
      </label>
      <div
        id="objects"
        ref={list}
        data-dragging={!!drop}
        onDragStart={event=>{
          event.stopPropagation();
          const node=(event.target as HTMLElement).closest<HTMLElement>('[data-object]'),row=source?.rows.find(row=>row.id===node?.dataset.object);
          if(!source?.reorder||search||!row||row.locked){event.preventDefault();return;}
          const wanted=selected.includes(row.id)?source.rows.filter(item=>selected.includes(item.id)).map(item=>item.id):[row.id];
          if(wanted.some(id=>source.rows.find(item=>item.id===id)?.parent!==row.parent||source.rows.find(item=>item.id===id)?.locked)){event.preventDefault();return;}
          dragging.current={source,ids:wanted};event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('application/x-notale-layers',JSON.stringify(wanted));
        }}
        onDragOver={event=>{
          const active=dragging.current,node=(event.target as HTMLElement).closest<HTMLElement>('[data-object]'),row=source?.rows.find(row=>row.id===node?.dataset.object);
          if(!active||active.source!==source||!row||active.ids.includes(row.id)||search||active.ids.some(id=>source.rows.find(item=>item.id===id)?.parent!==row.parent)){setDrop(undefined);return;}
          event.preventDefault();event.dataTransfer.dropEffect='move';const box=node!.getBoundingClientRect(),placement=event.clientY<box.top+box.height/2?'before':'after';
          setDrop({id:row.id,placement});
        }}
        onDrop={event=>{event.preventDefault();event.stopPropagation();const active=dragging.current;dragging.current=undefined;setDrop(undefined);if(active&&active.source===source&&drop)void source?.reorder?.(active.ids,drop.id,drop.placement).catch(editorActions.reportError);}}
        onDragEnd={()=>{dragging.current=undefined;setDrop(undefined);}}
        onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setDrop(undefined);}}
        onKeyDown={(event) => {
          if (
            event.ctrlKey ||
            event.metaKey ||
            event.altKey ||
            event.shiftKey ||
            !["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)
          )
            return;
          if (event.target instanceof HTMLInputElement) return;
          const target = (
            event.target as HTMLElement
          ).closest<HTMLButtonElement>("button[data-object]");
          if (!target || !source) return;
          const index = rows.findIndex(
            (row) => row.id === target.dataset.object,
          );
          if (index < 0) return;
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? rows.length - 1
                : Math.max(
                    0,
                    Math.min(
                      rows.length - 1,
                      index + (event.key === "ArrowUp" ? -1 : 1),
                    ),
                  );
          event.preventDefault();
          event.stopPropagation();
          editorActions.selectLayer(source, rows[next].id, false);
          event.currentTarget
            .querySelectorAll<HTMLButtonElement>("button[data-object]")
            [next]?.focus();
        }}
      >
        {source && rows.map((row) => (
          <div key={row.id} className="layer-drop-row" data-drop={drop?.id===row.id?drop.placement:undefined}>
            <LayerButton
              key={JSON.stringify([source.documentId, source.pageId, row.id])}
              row={row}
              source={search?{...source,reorder:undefined}:source}
              selected={ids.has(row.id)}
            />
          </div>
          ))}
      </div>
      {source && rows.length === 0 && !!search && (<p className="hint" role="status">{t("没有匹配的对象")}</p>)}
    </>
  );
}
