"use client";

import { useEffect, useRef, useState } from "react";
import { HomeComposer } from "../home-composer";
import { PixelWordmark, type WordmarkHandle } from "./pixel-wordmark";
import { StartEasterEgg } from "../../lib/start/easter-egg";
import { getInfo, type ServiceInfo } from "../../lib/api";

/** The start page: the wordmark, the box with who answers and with what, the keys. Wires the wordmark's poke to the egg; the egg itself lives in lib/start. */
export function StartScreen() {
  const [info, setInfo] = useState<ServiceInfo>();
  const stage = useRef<HTMLElement>(null), status = useRef<HTMLSpanElement>(null), wordmark = useRef<WordmarkHandle>(null), egg = useRef<StartEasterEgg | undefined>(undefined);
  useEffect(() => { void getInfo().then(setInfo, () => {}); }, []);
  const poke = (letter: SVGGraphicsElement) => {
    const main = stage.current, ground = main?.querySelector<HTMLElement>(".composer");
    if (!main || !ground) return;
    egg.current ??= new StartEasterEgg({ stage: main, poked: letter, letters: wordmark.current?.letters() ?? [], status: status.current, ground });
    void egg.current.play();
  };
  return (
    <main ref={stage} className="start-main">
      <h1 className="visually-hidden">想做一份什么样的讲义？</h1>
      <PixelWordmark ref={wordmark} onPoke={poke} />
      <HomeComposer status={info && <span ref={status} className="composer-status"><b>{info.generator ?? info.assistant}</b><span aria-hidden> · </span><code>{info.model}</code><span aria-hidden> · </span><em>{info.effort}</em></span>} />
      <p className="start-keys"><span><kbd>enter</kbd> 发送</span><span><kbd>shift+enter</kbd> 换行</span><span><kbd>拖入文件</kbd> 附件</span></p>
    </main>
  );
}
