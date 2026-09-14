<script>
import Pick from '$components/Pick.svelte';
import Dashboard from '$components/Dashboard/Dashboard.svelte';
import Methodology from '$components/Methodology.svelte';
import copy from '$data/copy.json';
import states from '$data/states.csv';
import {selectedState,revealMethods} from '$stores/misc.js';
import {onMount} from 'svelte';
function trapMethods(e){if(e.key!=='Tab')return;const all=[...e.currentTarget.querySelectorAll('a[href],button,summary,[tabindex]')].filter(n=>n.getClientRects().length&&!n.disabled);const first=all[0],last=all.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===e.currentTarget)){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}
const props=(type)=>copy.body.flatMap(s=>s.content).find(d=>d.type===type)?.value;
onMount(()=>{const id=new URLSearchParams(location.search).get('state');if(states.some(s=>s.id===id))setTimeout(()=>{if(!matchMedia('(min-width:1200px) and (min-height:700px)').matches)document.getElementById('dashboard').scrollIntoView();$selectedState=id},100)});
</script>
<svelte:window on:keydown={e=>{if(e.key==='Escape'){if($revealMethods){$revealMethods=false;document.querySelector('.methods')?.focus({preventScroll:true})}else $selectedState=undefined}}}/>
<header class="mini-header"><a href="../../../../../../index.html" target="_top">← Pudding Samples</a><span>2024-10-17 · 原作政策快照</span><a href="SAMPLE.md">Review 记录</a></header>
<div class="mini-intro"><h1>一张地图，51 条不同的路</h1><p>保留原作的 51 个州及特区迷宫、六段人物故事与全部插画。选择人物故事，或从地图进入各州迷宫。</p><p>以下政策及叙事保留原作历史语境，数据更新截止 2024 年 10 月 17 日。</p><a href="https://pudding.cool/2024/10/abortion-mazes/" target="_blank" rel="noreferrer">Jan Diehm & Michelle Pera-McGhee · The Pudding 原作 ↗</a></div>
<section id="pick"><Pick {...props('Pick')}/></section>
<section id="dashboard"><Dashboard {...props('Dashboard')}/></section>
<section id="methodology" on:keydown={trapMethods} role="dialog" aria-label="Methodology and sources" aria-modal={$revealMethods} tabindex="-1" class:visible={$revealMethods}><button class="close-methods" on:click={()=>{$revealMethods=false;document.querySelector('.methods')?.focus({preventScroll:true})}}>关闭方法说明 ×</button><Methodology {...props('Methodology')}/></section>
<style>.mini-header{display:flex;justify-content:space-between;gap:18px;padding:20px 28px;font:13px var(--sans);flex-wrap:wrap}.mini-intro{max-width:850px;margin:45px auto;text-align:center;padding:0 24px}.mini-intro h1{font:700 40px var(--serif)}.mini-intro p{font:16px/1.7 var(--sans);margin:12px 0}.mini-intro a{font:14px var(--sans)}#methodology{display:none}#methodology.visible{display:flex}:global(#pick){margin-bottom:4rem} @media(max-width:600px){.mini-intro h1{font-size:28px}}
@media(min-width:1200px) and (min-height:700px){
 :global(#app){height:900px;display:grid;grid-template-columns:380px minmax(0,1fr);grid-template-rows:56px 210px minmax(0,1fr);gap:12px 28px;padding:0 28px 20px}.mini-header{grid-column:1/-1;padding:18px 0;border-bottom:1px solid var(--color-tan)}.mini-intro{margin:0;padding:8px 0;text-align:left}.mini-intro h1{font-size:30px;line-height:1.3;margin:0 0 16px}.mini-intro p{font-size:14px;margin:8px 0}.mini-intro a{font-size:12px}
 :global(#pick){min-height:0;padding:12px 0;margin:0;justify-content:start;gap:14px}:global(#pick .title){text-align:left;align-items:start}:global(#pick h2){font-size:24px;margin:0 0 8px}:global(#pick .desc){font-size:12px}:global(#pick .directions){margin:8px 0}:global(#pick .directions p){margin:0}:global(#pick .directions p),:global(#pick .sub){font-size:14px}:global(#pick .stories){display:grid;grid-template-columns:repeat(3,1fr);gap:24px 10px}:global(#pick .story){width:100%;max-width:none}:global(#pick .name){font-size:24px}:global(#pick .info){font-size:12px}:global(#pick .img-wrapper){margin-bottom:10px}
 :global(#dashboard){grid-column:2;grid-row:2/4;min-height:0;display:grid;grid-template-rows:minmax(0,1fr) 70px}:global(#dashboard .grid-wrapper){min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable}:global(#dashboard .bar){position:static}:global(#grid){padding:12px 16px}:global(#grid.geo){max-width:820px}:global(#grid .tracker){z-index:1}
 #methodology.visible{position:fixed;inset:64px 160px 40px;min-height:0;overflow:auto;overscroll-behavior:contain;z-index:2000;border:1px solid var(--color-dark-tan);box-shadow:0 8px 40px #0003;display:block;padding:0 32px 32px}:global(#methodology .inner){margin:24px auto 0}:global(#methodology .activity){margin-bottom:28px}.close-methods{display:block;position:sticky;top:0;margin-left:auto;z-index:1;padding:12px;background:var(--color-tan)}
}
</style>
