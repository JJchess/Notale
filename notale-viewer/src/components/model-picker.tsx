"use client";

import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { lastModel, sameModel, type ModelCatalog, type ModelRef } from '../lib/models';
import { useLocale } from './locale';
import styles from './model-picker.module.css';

export function ModelPicker({ value, onChange, onReady }: { value?: ModelRef; onChange: (model: ModelRef, explicit?: boolean) => void; onReady: (ready: boolean) => void }) {
  const { t } = useLocale(), id = useId();
  const [catalog, setCatalog] = useState<ModelCatalog>(), [error, setError] = useState(false), [retry, setRetry] = useState(0), [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    void fetch('/notale-session/v1/models', { cache: 'no-store', signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('catalog');
      const data = await response.json() as ModelCatalog;
      if (!Array.isArray(data.providers) || !data.providers.length) throw new Error('catalog');
      setCatalog(data);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [retry]);
  const choices = catalog?.providers.flatMap(provider => provider.models.map(model => ({ ...model, provider, ref: { providerId: provider.id, modelId: model.id } }))) ?? [];
  const selected = choices.find(choice => sameModel(choice.ref, value));
  useEffect(() => { onReady(!!selected?.configured && !error); }, [selected?.configured, error, onReady]);
  useEffect(() => {
    if (value || !catalog) return;
    const remembered = lastModel();
    const preferred = choices.find(choice => sameModel(choice.ref, remembered))?.ref ?? catalog.defaultModel;
    if (preferred) onChange(preferred, false);
  }, [value, catalog, onChange]); // The catalog is immutable for this mount.
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]:not(:disabled), [role="menuitemradio"]:not(:disabled)')?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return <div className={styles.root} ref={root}>
    <button ref={trigger} type="button" className={styles.trigger} aria-label={t('选择模型', 'Select model')} aria-haspopup="menu" aria-expanded={open} aria-controls={id}
      onClick={() => { if (error) setRetry(n => n + 1); else setOpen(!open); }} disabled={!catalog && !error}>
      <span>{error ? t('模型加载失败 · 重试', 'Models unavailable · Retry') : selected?.label ?? (value ? value.modelId : t('选择模型', 'Select model'))}</span><ChevronDown size={13} aria-hidden="true" />
    </button>
    {open && <div className={styles.menu} id={id} role="menu" aria-label={t('选择模型', 'Select model')} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
      if (event.key === 'Tab') setOpen(false);
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]:not(:disabled)')];
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    }}>
      {catalog?.providers.map(provider => <div key={provider.id} role="group" aria-label={provider.label}>
        <div className={styles.label}>{provider.label}</div>
        {provider.models.map(model => { const ref = { providerId: provider.id, modelId: model.id }, chosen = sameModel(ref, value); return <button key={model.id} type="button" role="menuitemradio" aria-checked={chosen} disabled={!model.configured}
          onClick={() => { onChange(ref, true); setOpen(false); trigger.current?.focus(); }}>
          <span>{model.label}{!model.configured && <small>{t('未配置', 'Not configured')}</small>}</span>{chosen && <Check size={15} aria-hidden="true" />}
        </button>; })}
      </div>)}
    </div>}
  </div>;
}
