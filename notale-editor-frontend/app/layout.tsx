import type {Metadata} from 'next';
import type {ReactNode} from 'react';
import {Editor} from '../src/components/editor';
import '../src/editor.css';

export const metadata:Metadata={title:'Notale · 互动演示编辑器'};
export default function RootLayout({children}:{children:ReactNode}){
  return <html lang="zh"><body><Editor/>{children}</body></html>;
}
