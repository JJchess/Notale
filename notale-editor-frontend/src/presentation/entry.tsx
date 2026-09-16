'use client';
import dynamic from 'next/dynamic';
const Presentation=dynamic(()=>import('./presentation').then(module=>module.Presentation),{ssr:false,loading:()=> <main style={{position:'fixed',inset:0,background:'#18181c',color:'#aaa5b6',display:'grid',placeItems:'center',font:'14px system-ui'}}>正在准备放映…</main>});
export function PresentationEntry(){return <Presentation/>;}
