"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Locale = "zh-CN" | "en";
const KEY = "notale-language";
const LocaleContext = createContext({ locale: "zh-CN" as Locale, t: (zh: string, _en: string) => zh, setLocale: (_locale: Locale) => {} });

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setValue] = useState<Locale>("zh-CN");
  useEffect(() => {
    try { const saved = localStorage.getItem(KEY); if (saved === "en" || saved === "zh-CN") setValue(saved); } catch { /* Use Chinese when storage is unavailable. */ }
    const changed = (e: StorageEvent) => { if (e.key === KEY && (e.newValue === "en" || e.newValue === "zh-CN")) setValue(e.newValue); };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const setLocale = useCallback((next: Locale) => {
    setValue(next);
    try { localStorage.setItem(KEY, next); } catch { /* Preference remains active for this visit. */ }
  }, []);
  const value = useMemo(() => ({ locale, setLocale, t: (zh: string, en: string) => locale === "en" ? en : zh }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
export const useLocale = () => useContext(LocaleContext);

export function formatDate(iso: string, locale: Locale) {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(date) : "";
}
