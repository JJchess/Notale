<sample id="crossword-representation" category="general" variant="mini">
  <file path="samples/general/crossword-representation/mini/pages/index.html">
```html
<!doctype html><html lang="en">
<script type="module" crossorigin src="./build/assets/index-06e7a328.js"></script>
<link rel="stylesheet" href="./build/assets/index-ab1533ae.css">
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Who comes to mind? · Sample</title><div id="app"></div><link rel="stylesheet" href="mini-scrollbars.css"></html>
```
  </file>
  <file path="samples/general/crossword-representation/mini/pages/src/App.svelte">
```svelte
<script>
import Play from './components/Play.svelte';
import {puzzlesNYT,puzzlesToday} from './utils/loadData.js';
let group='publications';
</script>
<main><header><a href="../../../../../../index.html" target="_top">← Samples</a><span>THE PUDDING / 2020 ARCHIVE</span></header>
<aside class="story"><section class="intro"><p class="eyebrow">PLAY THE PUZZLE. SEE WHO IS IN IT.</p><h1>Who comes to mind?</h1><p>Thirteen original mini crosswords turn a study of representation into something you can play. Solve a puzzle, then highlight the people behind its clues.</p><p class="credit">By Russell Samora, Michelle Pera-McGhee & Amelia Wattenberger · <a href="https://pudding.cool/2020/11/crossword-puzzles/" target="_blank" rel="noopener">Original ↗</a> · <a href="SAMPLE.md">Review notes</a></p></section>
<nav aria-label="Puzzle collection"><button class:chosen={group==='publications'} on:click={()=>group='publications'}>5 publications · 2020</button><button class:chosen={group==='decades'} on:click={()=>group='decades'}>NYT · 8 decades</button></nav>
<footer><p>Each mini has 10 clues. The original study’s percentages were rounded to the nearest 10% when constructing these puzzles. The findings describe the study’s historical dataset, not current publications.</p><details><summary>How were these made?</summary><p>The authors used Saul Pwanson’s crossword database and their analysis of named people in clues and answers. Their race and gender classifications and methodology remain those of the original 2020 study.</p><p><a href="https://pudding.cool/2020/11/crossword/#methodology" target="_blank" rel="noopener">Read the original study and methodology ↗</a></p></details></footer></aside>{#key group}<Play id="puzzle" puzzles={group==='publications'?puzzlesToday:puzzlesNYT} title={group==='publications'?'Major Publications in 2020':'New York Times by Decade'}/>{/key}
</main>
<svg>
  <defs>
    <pattern
      id="pattern-urm"
      x="0"
      y="0"
      width="1"
      height="1"
      patternUnits="userSpaceOnUse">
      <rect x="0" y="0" width="1" height="1" fill="#fff"></rect>
      <path d="M0 0 L 0 1 L 1 0 L 0 0" fill="#C63DA3"></path>
    </pattern>

    <pattern
      id="pattern-woman"
      x="0"
      y="0"
      width="1"
      height="1"
      patternUnits="userSpaceOnUse">
      <rect x="0" y="0" width="1" height="1" fill="#fff"></rect>
      <path d="M0 0 L 0 1 L 1 0 L 0 0" fill="#4864FE"></path>
    </pattern>
  </defs>
</svg>
<style>svg{height:0;overflow:hidden;position:absolute}</style>
```
  </file>
  <file path="samples/general/crossword-representation/mini/pages/src/components/Play.svelte">
```svelte
<script>
  import Crossword from "../../vendor/svelte-crossword/src/Crossword.svelte";
  export let id;
  export let title;
  export let theme = "classic";
  export let puzzles = [];

  const revealDuration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1000;
  let width = innerWidth;
  let active;
  let revealed;
  let current;

  $: currentId = puzzles.find((d) => d.id === current)
    ? current
    : puzzles[0].id;
  $: puzzle = puzzles.find((d) => d.id === currentId);
  $: name = puzzle.value;
  $: data = addCustom(puzzle.data);
  $: percentURM = puzzle.urm;
  $: percentWoman = puzzle.woman;

  function addCustom(arr) {
    return arr.map((d) => ({
      ...d,
      custom: `${d.race} ${d.gender}`,
    }));
  }
</script>

<svelte:window bind:innerWidth={width} />

<section id="{id}" class="{theme}">
  <div class="info">
    <h2>{title}</h2>
    <select aria-label="Puzzle" bind:value="{current}">
      {#each puzzles as { id, value }}
        <option value="{id}">{value}</option>
      {/each}
    </select>
  </div>

  <div class="content">
    {#if currentId === "nyt1970s"}<p class="correction">1970s: the main study reports 9% minoritized racial groups. This corrects a 91% typo in the companion puzzle data.</p>{/if}
    <p class="insight" class:revealed>
      Our analysis of people in
      {name}
      puzzles revealed that
      <br />
      <button
        title="{revealed ? '' : 'complete the puzzle to see finding'}"
        class:active="{active === 'woman'}"
        class="woman"
        on:click="{() => (active = active === 'woman' ? null : 'woman')}"><span><span
            class="value">{percentWoman}</span></span>
        were women</button>
      and
      <button
        title="{revealed ? '' : 'complete the puzzle to see finding'}"
        class:active="{active === 'urm'}"
        class="urm"
        on:click="{() => (active = active === 'urm' ? null : 'urm')}"><span><span
            class="value">{percentURM}</span></span>
        were minoritized racial groups.</button>
    </p>

    <div
      class="xd"
      class:revealed
      class:urm="{active === 'urm'}"
      class:woman="{active === 'woman'}">
      <Crossword
        data="{data}"
        theme="{theme}"
        disableHighlight="{true}"
        showKeyboard="{revealed !== true && width < 720}"
        {revealDuration}
        bind:revealed />
    </div>
  </div>
</section>

<style>
  section {
    --xd-cell-text-font: var(--sans);
    --xd-clue-text-font: var(--sans);
    --xd-toolbar-text-font: var(--sans);
    max-width: 960px;
    margin: 3rem auto;
    margin-bottom: 6rem;
  }

  .info {
    text-align: left;
  }

  h2 {
    font-size: 1.5em;
  }

  .content {
    display: flex;
    flex-direction: column;
  }

  .xd {
    max-width: 800px;
    margin: 0 auto;
    font-family: --sans;
    width: 100%;
    order: 0;
  }

  .insight {
    width: 100%;
    max-width: var(--column-width);
    margin: 1em auto;
    font-size: 0.85em;
    line-height: 2.2;
    order: 1;
    display: none;
  }

  .insight.revealed {
    display: block;
  }

  button {
    cursor: not-allowed;
  }

  span {
    font-weight: 700;
    border-bottom: 2px solid currentColor;
  }

  .value {
    opacity: 0;
    border: none;
  }

  .revealed .value {
    opacity: 1;
  }

  .revealed span {
    border: none;
  }

  .revealed button {
    cursor: pointer;
  }

  .active {
    opacity: 1;
  }

  .revealed .active.urm {
    background-color: var(--urm);
  }

  .revealed .active.woman {
    background-color: var(--woman);
  }

  br {
    display: none;
  }

  @media only screen and (min-width: 640px) {
    .info {
      text-align: center;
    }
    .insight {
      order: 0;
      font-size: 1em;
      text-align: center;
      display: block;
      line-height: 1.8;
    }
    .xd {
      order: 1;
    }
    h2 {
      font-size: 2em;
    }
    br {
      display: block;
    }
  }
</style>
```
  </file>
  <file path="samples/general/crossword-representation/mini/pages/src/main.js">
```javascript
import App from './App.svelte';new App({target:document.querySelector('#app')});
let hadCompletion=false;
function accessible(){document.querySelectorAll('.cell').forEach(e=>{const pos=e.getAttribute('transform').match(/[\d.]+/g),value=e.querySelector('.value')?.textContent.trim()||'blank';e.setAttribute('role','button');e.setAttribute('aria-label',`Row ${+pos[1]+1}, column ${+pos[0]+1}, ${value}`)});document.querySelectorAll('.bar button').forEach((e,i)=>e.setAttribute('aria-label',i?'Next clue':'Previous clue'));const complete=document.querySelector('.completed');if(complete&&!hadCompletion)complete.querySelector('button')?.focus();if(!complete&&hadCompletion)document.querySelector('select')?.focus();hadCompletion=!!complete;}
new MutationObserver(accessible).observe(document.querySelector('#app'),{childList:true,subtree:true});accessible();
addEventListener('keydown',e=>{if(e.key==='Escape'){const b=document.querySelector('.completed button');if(b)b.click();document.querySelector('select')?.focus();}});
```
  </file>
  <file path="samples/general/crossword-representation/mini/pages/src/utils/loadData.js">
```javascript
import usa2020 from "../data/usa2020.json";
import up2020 from "../data/up2020.json";
import nyt2020 from "../data/nyt2020.json";
import wsj2020 from "../data/wsj2020.json";
import lat2020 from "../data/lat2020.json";

import nyt1940s from "../data/nyt1940s.json";
import nyt1950s from "../data/nyt1950s.json";
import nyt1960s from "../data/nyt1960s.json";
import nyt1970s from "../data/nyt1970s.json";
import nyt1980s from "../data/nyt1980s.json";
import nyt1990s from "../data/nyt1990s.json";
import nyt2000s from "../data/nyt2000s.json";
import nyt2010s from "../data/nyt2010s.json";

const puzzlesToday = [
	{
		id: "lat2020",
		value: "LA Times",
		data: lat2020,
		urm: "25%",
		white: "75%",
		woman: "32%",
		man: "68%",
	},
	{
		id: "nyt2020",
		value: "New York Times",
		data: nyt2020,
		urm: "28%",
		white: "72%",
		woman: "36%",
		man: "64%",
	},
	{
		id: "up2020",
		value: "Universal",
		data: up2020,
		urm: "29%",
		white: "71%",
		woman: "46%",
		man: "54%",
	},
	{
		id: "usa2020",
		value: "USA Today",
		data: usa2020,
		urm: "48%",
		white: "52%",
		woman: "72%",
		man: "28%",
	},
	{
		id: "wsj2020",
		value: "Wall Street Journal",
		data: wsj2020,
		urm: "24%",
		white: "76%",
		woman: "31%",
		man: "69%",
	},
];

const puzzlesNYT = [
	{
		id: "nyt1940s",
		value: "1940s",
		data: nyt1940s,
		urm: "6%",
		white: "94%",
		woman: "10%",
		man: "90%",
	},
	{
		id: "nyt1950s",
		value: "1950s",
		data: nyt1950s,
		urm: "9%",
		white: "91%",
		woman: "16%",
		man: "84%",
	},
	{
		id: "nyt1960s",
		value: "1960s",
		data: nyt1960s,
		urm: "7%",
		white: "93%",
		woman: "15%",
		man: "85%",
	},
	{
		id: "nyt1970s",
		value: "1970s",
		data: nyt1970s,
		urm: "9%",
		white: "91%",
		woman: "20%",
		man: "80%",
	},
	{
		id: "nyt1980s",
		value: "1980s",
		data: nyt1980s,
		urm: "7%",
		white: "93%",
		woman: "17%",
		man: "83%",
	},
	{
		id: "nyt1990s",
		value: "1990s",
		data: nyt1990s,
		urm: "11%",
		white: "89%",
		woman: "22%",
		man: "78%",
	},
	{
		id: "nyt2000s",
		value: "2000s",
		data: nyt2000s,
		urm: "15%",
		white: "85%",
		woman: "28%",
		man: "72%",
	},
	{
		id: "nyt2010s",
		value: "2010s",
		data: nyt2010s,
		urm: "25%",
		white: "75%",
		woman: "27%",
		man: "73%",
	},
];

export { puzzlesNYT, puzzlesToday };
```
  </file>
  <file path="samples/general/crossword-representation/mini/pages/style.css">
```css
*{box-sizing:border-box}body{margin:0}main{max-width:1120px;margin:auto;padding:28px 36px}header{display:flex;justify-content:space-between;gap:20px;font-size:12px;border-bottom:1px solid #bbb;padding-bottom:20px}.intro{max-width:780px;margin:36px auto;text-align:center}.intro h1{font-size:54px;line-height:1.1;margin:14px 0}.intro p{font-size:19px;line-height:1.55}.intro .eyebrow{font-size:12px;letter-spacing:1.5px}.intro .credit{font-size:13px;color:#555}nav{display:flex;justify-content:center;gap:12px;margin-bottom:24px}nav button{padding:10px 18px;background:#f1f1f1}.chosen{background:#1a1a1a;color:#fff}button:focus-visible,select:focus-visible,a:focus-visible,summary:focus-visible{outline:3px solid #4864fe;outline-offset:3px}select{padding:6px 10px;background:#fff;border:1px solid #aaa}#puzzle{margin-top:24px;margin-bottom:40px}.correction{font-size:13px;text-align:center;max-width:660px;margin:10px auto;color:#555}footer{max-width:800px;margin:auto;padding:22px 0;border-top:1px solid #bbb;font-size:14px}footer p{line-height:1.6}summary{cursor:pointer}.xd .cell{cursor:pointer}@media(max-width:639px){main{padding:20px 16px}header{font-size:10px}.intro{margin:26px auto}.intro h1{font-size:39px}.intro p{font-size:17px}.intro .credit{font-size:12px}nav{gap:8px}nav button{font-size:14px;padding:10px}#puzzle h2{font-size:25px}.intro .eyebrow{font-size:10px;letter-spacing:1px}}

/* Persistent context alongside the complete crossword; clue/method text scrolls locally. */
@media(min-width:1200px) and (min-height:700px){
 main{height:900px;max-width:1540px;padding:24px 32px;display:grid;grid-template-columns:300px minmax(0,1fr);grid-template-rows:36px minmax(0,1fr);gap:24px 56px}header{grid-column:1/-1;padding-bottom:16px}
 .story{min-height:0;display:flex;flex-direction:column}.intro{text-align:left;margin:0 0 20px}.intro h1{font-size:44px;margin:12px 0 20px}.intro p{font-size:17px;line-height:1.5}.intro .eyebrow{font-size:10px;letter-spacing:1px}.intro .credit{font-size:12px;line-height:1.5}nav{flex-direction:column;gap:8px;margin:0 0 20px}nav button{font-size:16px;text-align:left}
 footer{min-height:0;max-width:none;margin:0;padding:12px 0;font-size:13px;overflow:auto;overscroll-behavior:contain}footer p{margin:8px 0}footer details p{font-size:13px}
 #puzzle{min-width:0;margin:0;width:100%;max-width:960px}#puzzle .info{display:flex;align-items:center;justify-content:space-between;gap:20px;text-align:left}#puzzle h2{font-size:26px;margin:0}#puzzle .insight{margin:12px auto;font-size:16px;line-height:1.7}#puzzle .toolbar{padding:8px 0;margin-bottom:12px}#puzzle .puzzle,#puzzle .clues{position:static}#puzzle .clues--list .list{max-height:220px;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;margin-bottom:16px}#puzzle .correction{margin:8px auto 0;font-size:12px}
}
```
  </file>
  <file path="samples/general/crossword-representation/mini/pages/mini-scrollbars.css">
```css
/* Local scrollbars inherit the surrounding ink, including light/dark themes. */
@supports selector(::-webkit-scrollbar) {
  * { scrollbar-width: auto !important; scrollbar-color: auto !important; }
  *::-webkit-scrollbar { width: 8px !important; height: 8px !important; }
  *::-webkit-scrollbar-track, *::-webkit-scrollbar-corner { background: transparent !important; }
  *::-webkit-scrollbar-thumb {
    background: #8888 !important;
    background: color-mix(in srgb, currentColor 28%, transparent) !important;
    border: 2px solid transparent !important;
    border-radius: 999px !important;
    background-clip: padding-box !important;
    min-height: 28px !important;
    min-width: 28px !important;
  }
  *::-webkit-scrollbar-thumb:hover {
    background-color: color-mix(in srgb, currentColor 46%, transparent) !important;
  }
  *::-webkit-scrollbar-thumb:active {
    background-color: color-mix(in srgb, currentColor 62%, transparent) !important;
  }
}
@supports not selector(::-webkit-scrollbar) {
  * { scrollbar-width: thin !important; scrollbar-color: #8888 transparent !important; }
  @supports (color: color-mix(in srgb, black, transparent)) {
    * { scrollbar-color: color-mix(in srgb, currentColor 28%, transparent) transparent !important; }
    *:hover, *:focus-visible { scrollbar-color: color-mix(in srgb, currentColor 46%, transparent) transparent !important; }
  }
}
@media (forced-colors: active) {
  * { scrollbar-width: auto !important; scrollbar-color: auto !important; }
  *::-webkit-scrollbar-thumb { background: ButtonText !important; }
}
```
  </file>
  <omitted path="build/assets/index-06e7a328.js">本地已构建运行包；作者代码在本 bundle。题库 src/data/*.json 与 MIT 组件 vendor/svelte-crossword/ 保留本地，不全文注入。题库为条目数组：x/y（从0起）、direction（across/down）、answer、clue；race/gender 等元数据由 Play 转为 custom 分类。Crossword 接收 data、theme、disableHighlight、showKeyboard、revealDuration，双向绑定 revealed；组件承担交叉格输入、检查、揭晓及撤销/重做。接口用法见 Play.svelte，来源/授权见 vendor/svelte-crossword/README.md 和 LICENSE。这是 Svelte 源码示范，部署使用构建产物；依赖未随 bundle 内联，不代表任意讲义已安装该组件。</omitted>
  <omitted path="build/assets/index-ab1533ae.css">本地已构建样式，包含第三方组件样式；本 bundle 保留作者 CSS，组件源码和授权仍在本地 vendor/svelte-crossword/。</omitted>
</sample>
