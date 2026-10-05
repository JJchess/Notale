"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useLocale } from "../locale";
import styles from "./ui.module.css";

export function Dialog({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null), previous = useRef<HTMLElement | null>(null);
  const id = useId(), { t } = useLocale();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    previous.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      const trigger = previous.current;
      if (dialog.open) dialog.close();
      // A conditional dialog can unmount instead of receiving open=false. Wait until the
      // surrounding drawer has also become inert before choosing a valid return target.
      queueMicrotask(() => {
        const available = (node: HTMLElement | null): node is HTMLElement => !!node?.isConnected && !node.closest("[inert]") && !node.matches(":disabled") && node.getClientRects().length > 0;
        const target = available(trigger) ? trigger : document.querySelector<HTMLElement>("[data-navigation-toggle]");
        const activeDialog = document.querySelector("dialog[open]");
        if (available(target) && (!activeDialog || activeDialog.contains(target))) target.focus();
        window.dispatchEvent(new Event("notale-dialog-closed"));
      });
    };
  }, [open]);
  return <dialog ref={ref} className={`${styles.dialog} ${wide ? styles.wide : ""}`} aria-labelledby={id}
    onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
    }}>
    <header className={styles.dialogHeader}><h2 id={id}>{title}</h2><button type="button" className="icon-button" aria-label={t("关闭", "Close")} title={t("关闭", "Close")} onClick={onClose}><X size={18} /></button></header>
    {open && children}
  </dialog>;
}
