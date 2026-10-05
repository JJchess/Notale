"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, BookOpen, ChartNoAxesCombined, Code2, FlaskConical } from "lucide-react";
import { HomeComposer } from "../home-composer";
import { useLocale } from "../locale";
import { LibraryList } from "../library/library-list";
import { useSessionList } from "../../lib/use-session-list";
import { getInfo, type ServiceInfo } from "../../lib/api";
import styles from "./start.module.css";

const examples = [
  { icon: FlaskConical, label: ["理解一个原理", "Explain a concept"], prompt: ["为高中生制作一份 15 分钟的讲义，用可交互的波形演示解释声音的频率、振幅和叠加。", "Create a 15-minute lecture for high-school students explaining sound frequency, amplitude and superposition with interactive wave demonstrations."] },
  { icon: Code2, label: ["拆解一段算法", "Unpack an algorithm"], prompt: ["为初学者制作一份 20 分钟的二分查找讲义，包含逐步运行的代码、数组可视化和边界条件练习。", "Create a 20-minute introduction to binary search, with step-by-step code, an interactive array visualization and exercises about boundary conditions."] },
  { icon: ChartNoAxesCombined, label: ["读懂一组数据", "Make data make sense"], prompt: ["为大学一年级学生制作一份 20 分钟的讲义，用散点图和可调节的数据示例解释相关性与因果关系。", "Create a 20-minute lecture for first-year students explaining correlation versus causation with scatterplots and adjustable data examples."] },
  { icon: BookOpen, label: ["讲清一篇论文", "Teach a paper"], prompt: ["帮我把接下来上传的论文变成一份 30 分钟的组会讲义。先提炼问题和方法，再用交互图示讲清关键结果与局限。", "Help turn the paper I will upload into a 30-minute research seminar. Explain the problem and method, then use interactive diagrams to explore the key results and limitations."] },
] as const;

/** Original, lightweight paper composition: vector diagrams, real prompt actions, no WebGL loop. */
function KnowledgeScene({ onSelect }: { onSelect: (index: number) => void }) {
  const { t } = useLocale();
  return <div className={styles.scene}>
    <div className={styles.orbit} aria-hidden="true" />
    <button className={`${styles.sheet} ${styles.code}`} onClick={() => onSelect(1)} title={t("拆解一段算法", "Unpack an algorithm")} aria-label={t("以二分查找为主题", "Start with binary search")}>
      <span className={styles.sheetHead}><span>02 / CODE</span><Code2 size={13} /></span>
      <span className={styles.codeLines} aria-hidden="true"><span><i>while</i> left ≤ right:</span><span>  mid = (left + right) / 2</span><span>  <i>if</i> target == items[mid]:</span><span>    <b>return</b> mid</span></span>
      <svg viewBox="0 0 190 42" aria-hidden="true">{[0,1,2,3,4,5,6].map((n) => <g key={n}><rect x={n*27} y="8" width="22" height="26" rx="4" fill={n === 3 ? "#7565d9" : "#eceaf6"}/><text x={n*27+11} y="25" textAnchor="middle" fill={n === 3 ? "white" : "#8c869c"} fontSize="10">{[2,5,8,13,21,34,55][n]}</text></g>)}</svg>
    </button>
    <button className={`${styles.sheet} ${styles.wave}`} onClick={() => onSelect(0)} title={t("理解一个原理", "Explain a concept")} aria-label={t("以声音与波为主题", "Start with sound and waves")}>
      <span className={styles.sheetHead}><span>01 / EXPLORE</span><ArrowUpRight size={14}/></span>
      <strong>{t("让原理，看得见。", "See the idea.")}</strong>
      <svg viewBox="0 0 240 100" aria-hidden="true"><path d="M0 50H240M120 5V95" stroke="#e8e6ee" fill="none"/><path d="M0 50C20 50 20 12 40 12S60 88 80 88S100 12 120 12S140 88 160 88S180 12 200 12S220 50 240 50" fill="none" stroke="#8171ce" strokeWidth="2.5"/><path d="M0 50C40 2 80 2 120 50S200 98 240 50" fill="none" stroke="#9fb7cf" strokeWidth="1.5" strokeDasharray="4 3"/></svg>
      <span className={styles.slider} aria-hidden="true"><i/><b/></span>
      <span className={styles.sheetFoot}>f = 440 Hz <span>01 — 08</span></span>
    </button>
    <button className={`${styles.sheet} ${styles.data}`} onClick={() => onSelect(2)} title={t("读懂一组数据", "Make data make sense")} aria-label={t("以相关性与因果为主题", "Start with correlation and causation")}>
      <span className={styles.sheetHead}><span>03 / CONNECT</span><ChartNoAxesCombined size={13}/></span>
      <svg viewBox="0 0 155 104" aria-hidden="true"><path d="M12 8V91H150M12 66H150M12 41H150M12 16H150" fill="none" stroke="#e8e6ee"/><path d="M18 85L142 17" stroke="#b7b0d8" strokeDasharray="3 3"/>{[[24,76],[31,81],[43,55],[54,71],[66,51],[77,59],[87,27],[101,46],[117,20],[130,29]].map(([x,y],i)=><circle key={i} cx={x} cy={y} r={i===6?5:3.5} fill={i===6?"#7765cb":"#b4aacd"}/>)}</svg>
      <span className={styles.sheetFoot}>{t("从观察到理解", "From observation to insight")}</span>
    </button>
  </div>;
}

export function StartScreen() {
  const { t } = useLocale();
  const [info, setInfo] = useState<ServiceInfo>();
  const [promptSeed, setPromptSeed] = useState<{ id: string; text: string }>();
  const sessions = useSessionList();
  useEffect(() => { let active = true; void getInfo().then(value => { if (active) setInfo(value); }, () => {}); return () => { active = false; }; }, []);
  const choose = (index: number) => { const item = examples[index]; setPromptSeed({ id: crypto.randomUUID(), text: t(item.prompt[0], item.prompt[1]) }); };
  return <main className={styles.home}>
    <div className={styles.content}>
      <KnowledgeScene onSelect={choose}/>
      <header className={styles.heading}><p>NOTALE / {t("知识的下一种表达", "A NEW WAY TO TEACH")}</p><h1>{t("把知识，讲清楚。", "Give your ideas a classroom.")}</h1><p>{t("从一个想法开始，做一份可以探索的讲义。", "Start with an idea. Create a lecture people can explore.")}</p></header>
      <HomeComposer promptSeed={promptSeed} status={info && <span className={styles.model}><i aria-hidden="true"/><b>{info.generator ?? info.assistant}</b><span title={info.model}>{info.model}</span></span>}/>
      <div className={styles.examples} aria-label={t("创作灵感", "Starting points")}>{examples.map((item,index)=><button key={index} onClick={()=>choose(index)}><item.icon size={15}/><span>{t(item.label[0],item.label[1])}</span><ArrowUpRight size={12}/></button>)}</div>
      {sessions.items.length > 0 && <section className={styles.recent}><header><h2>{t("接着上次的想法", "Pick up where you left off")}</h2><Link href="/library">{t("全部讲义", "All lectures")}<ArrowRight size={14}/></Link></header><LibraryList items={sessions.items.slice(0,4)} compact/></section>}
      {sessions.error && <button className={styles.retry} onClick={() => void sessions.refresh()}>{t("最近讲义未能加载，点击重试", "Could not load recent lectures. Retry")}</button>}
    </div>
  </main>;
}
