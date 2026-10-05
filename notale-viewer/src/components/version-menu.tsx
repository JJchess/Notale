"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Download, History } from "lucide-react";
import { useLocale } from "./locale";

export interface VersionItem { runId: string; version: number; kind: "generate" | "fix"; basedOn?: number; at: string }

export function VersionMenu({ versions, shown, onPick, download }: { versions: VersionItem[]; shown: string; onPick: (runId: string) => void; download: string }) {
  const { locale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null);
  const current = versions.find(item => item.runId === shown);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    box.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); button.current?.focus(); return; }
    if (event.key === "Tab") { setOpen(false); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (!open) { setOpen(true); return; }
    const list = [...(box.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])], at = list.indexOf(document.activeElement as HTMLElement);
    list[event.key === "Home" ? 0 : event.key === "End" ? list.length - 1 : (at + (event.key === "ArrowDown" ? 1 : list.length - 1)) % list.length]?.focus();
  };
  const choose = (runId: string) => { onPick(runId); setOpen(false); button.current?.focus(); };
  return <div ref={box} className="version-menu" onKeyDown={onKey}>
    <button ref={button} type="button" className="version-button" aria-haspopup="menu" aria-expanded={open} title={t("版本记录", "Version history")} onClick={() => setOpen(value => !value)}>
      <History size={14} aria-hidden="true" /><span>{t(`版本 ${current?.version ?? "—"}`, `Version ${current?.version ?? "—"}`)}</span><ChevronDown size={12} aria-hidden="true" />
    </button>
    {open && <div className="version-list" role="menu" aria-label={t("版本", "Versions")}>
      <div className="version-rows">{[...versions].reverse().map(item => <button key={item.runId} type="button" role="menuitemradio" aria-checked={item.runId === shown} onClick={() => choose(item.runId)}>
        <b>{item.version}</b><span>{item.kind === "generate" ? t("首次生成", "Generated") : item.basedOn ? t(`基于版本 ${item.basedOn} 修改`, `Revised from ${item.basedOn}`) : t("修改", "Revised")}</span>
        <time dateTime={item.at}>{new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(item.at))}</time>
        {item.runId === shown && <Check className="version-check" size={13} aria-hidden="true" />}
      </button>)}</div>
      <hr /><a role="menuitem" href={download} download onClick={() => setOpen(false)}><Download size={14} aria-hidden="true" />{t("下载 .notale", "Download .notale")}</a>
    </div>}
  </div>;
}
