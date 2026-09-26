'use client';
import {createContext,useContext,useEffect,useLayoutEffect,useMemo,useSyncExternalStore,type ReactNode} from 'react';
import {initializeLocale,localeStore,translator,type Locale} from './store';
const LocaleContext=createContext<Locale>('zh-CN');
export function LocaleProvider({initial,children}:{initial:Locale;children:ReactNode}){
 const locale=useSyncExternalStore(localeStore.subscribe,localeStore.getSnapshot,()=>initial);
 useLayoutEffect(()=>initializeLocale(initial),[initial]);
 useEffect(()=>{document.documentElement.lang=locale;document.title=translator(locale)(location.pathname==='/present'?'Notale · 放映':'Notale · 互动演示编辑器');},[locale]);
 return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}
export function useLocale(){return useContext(LocaleContext);}
export function useI18n(){const locale=useLocale();return useMemo(()=>translator(locale),[locale]);}
export function useDateTime(options:Intl.DateTimeFormatOptions={}){const locale=useLocale();return (date:string|number|Date)=>new Intl.DateTimeFormat(locale,options).format(new Date(date));}
