<script>
import Pick from '$components/Pick.svelte';
import Dashboard from '$components/Dashboard/Dashboard.svelte';
import Methodology from '$components/Methodology.svelte';
import copy from '$data/copy.json';
import states from '$data/states.csv';
import {selectedState,revealMethods} from '$stores/misc.js';
import {onMount} from 'svelte';
const props=(type)=>copy.body.flatMap(s=>s.content).find(d=>d.type===type)?.value;
onMount(()=>{const id=new URLSearchParams(location.search).get('state');if(states.some(s=>s.id===id))setTimeout(()=>{document.getElementById('dashboard').scrollIntoView();$selectedState=id},100)});
</script>
<svelte:window on:keydown={e=>{if(e.key==='Escape')$selectedState=undefined}}/>
<header class="mini-header"><a href="../../../../../index.html" target="_top">← Pudding Samples</a><span>2024-10-17 · 原作政策快照</span><a href="SAMPLE.md">Review 记录</a></header>
<div class="mini-intro"><h1>一张地图，51 条不同的路</h1><p>保留原作的 51 个州及特区迷宫、六段人物故事与全部插画。选择故事，或向下浏览地图。</p><p>以下政策及叙事保留原作历史语境，数据更新截止 2024 年 10 月 17 日。</p><a href="https://pudding.cool/2024/10/abortion-mazes/" target="_blank" rel="noreferrer">Jan Diehm & Michelle Pera-McGhee · The Pudding 原作 ↗</a></div>
<section id="pick"><Pick {...props('Pick')}/></section>
<section id="dashboard"><Dashboard {...props('Dashboard')}/></section>
<section id="methodology" class:visible={$revealMethods}><Methodology {...props('Methodology')}/></section>
<style>.mini-header{display:flex;justify-content:space-between;gap:18px;padding:20px 28px;font:13px var(--sans);flex-wrap:wrap}.mini-intro{max-width:850px;margin:45px auto;text-align:center;padding:0 24px}.mini-intro h1{font:700 40px var(--serif)}.mini-intro p{font:16px/1.7 var(--sans);margin:12px 0}.mini-intro a{font:14px var(--sans)}#methodology{display:none}#methodology.visible{display:flex}:global(#pick){margin-bottom:4rem} @media(max-width:600px){.mini-intro h1{font-size:28px}}</style>
