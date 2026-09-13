import {ClosingSessionNotice} from '../src/components/closing-sessions';
import type {Metadata} from 'next';
import type {ReactNode} from 'react';

export const metadata:Metadata={title:'Notale · 互动演示编辑器'};
export default function RootLayout({children}:{children:ReactNode}){
  return <html lang="zh"><body>{children}<ClosingSessionNotice/></body></html>;
}
