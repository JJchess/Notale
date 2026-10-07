"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "../locale";
import { stylePreviewFrame } from "../../lib/preview-style";
import styles from "./generation.module.css";

type Deck = { step?: number; stepMax?: number; stepTo?: (step: number) => void };
const W = 1600, H = 900;

/** A finished page, live and fitted to the space it has (the page is always 1600×900). Its own
 * keys work inside it; the step controls below talk to its Deck (same origin). */
export function PagePreview({ src, title, position, onPrevious, onNext }: {
  src: string; title: string; position: { index: number; total: number };
  onPrevious?: () => void; onNext?: () => void;
}) {
  const { t } = useLocale();
  const stage = useRef<HTMLDivElement>(null), frame = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(0.5);
  const [steps, setSteps] = useState<{ step: number; max: number }>({ step: 0, max: 0 });
  useEffect(() => frame.current ? stylePreviewFrame(frame.current) : undefined, [src]);
  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    const fit = () => setScale(Math.min(node.clientWidth / W, node.clientHeight / H));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  // The page's step count and current step, read from its Deck (it steps by its own keys too).
  useEffect(() => {
    setSteps({ step: 0, max: 0 });
    const read = () => { try { const deck = (frame.current?.contentWindow as (Window & { Deck?: Deck }) | null)?.Deck; setSteps({ step: deck?.step ?? 0, max: deck?.stepMax ?? 0 }); } catch { /* not loaded yet */ } };
    const timer = setInterval(read, 400);
    return () => clearInterval(timer);
  }, [src]);
  const stepTo = (step: number) => {
    try { (frame.current?.contentWindow as (Window & { Deck?: Deck }) | null)?.Deck?.stepTo?.(step); } catch { /* the page went away */ }
    setSteps(current => ({ ...current, step }));
  };
  return (
    <div className={`page-preview ${styles.preview}`}>
      <div className="page-preview-head">
        <button type="button" className="icon-button" aria-label={t("上一页", "Previous page")} title={t("上一页", "Previous page")} disabled={!onPrevious} onClick={onPrevious}><Chevron dir="left" /></button>
        <span aria-label={t(`第 ${position.index} 页，共 ${position.total} 页`, `Page ${position.index} of ${position.total}`)}>{position.index} / {position.total}</span>
        <button type="button" className="icon-button" aria-label={t("下一页", "Next page")} title={t("下一页", "Next page")} disabled={!onNext} onClick={onNext}><Chevron dir="right" /></button>
      </div>
      <div ref={stage} className="page-preview-stage">
        <iframe key={src} ref={frame} src={src} title={title} style={{ transform: `translate(-50%, -50%) scale(${scale})` }} />
      </div>
      {steps.max > 0 && <div className="page-preview-steps">
        <span>{t("步骤", "Step")} {steps.step} / {steps.max}</span>
        <button type="button" className="icon-button" aria-label={t("上一步", "Previous step")} title={t("上一步", "Previous step")} disabled={steps.step <= 0} onClick={() => stepTo(steps.step - 1)}><Chevron dir="left" /></button>
        <button type="button" className="icon-button" aria-label={t("下一步", "Next step")} title={t("下一步", "Next step")} disabled={steps.step >= steps.max} onClick={() => stepTo(steps.step + 1)}><Chevron dir="right" /></button>
      </div>}
    </div>
  );
}
function Chevron({ dir }: { dir: "left" | "right" }) {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d={dir === "left" ? "M10 3.5 5.5 8l4.5 4.5" : "M6 3.5 10.5 8 6 12.5"} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
