import {ClosingSessionNotice} from '../src/components/closing-sessions';
import type {Metadata} from 'next';
import type {ReactNode} from 'react';
import {cookies,headers} from 'next/headers';
import {resolveLocale,translateMessage} from '@notale/editor/i18n';
import {LocaleProvider} from '../src/i18n/react';

export async function generateMetadata():Promise<Metadata>{const locale=resolveLocale((await cookies()).get('notale-locale')?.value,(await headers()).get('accept-language')??'');return {title:translateMessage(locale,'Notale · 互动演示编辑器')};}
export default async function RootLayout({children}:{children:ReactNode}){
  const locale=resolveLocale((await cookies()).get('notale-locale')?.value,(await headers()).get('accept-language')??'');
  return <html lang={locale}><body><LocaleProvider initial={locale}>{children}<ClosingSessionNotice/></LocaleProvider></body></html>;
}
