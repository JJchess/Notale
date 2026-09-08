<script>
import Play from './components/Play.svelte';
import {puzzlesNYT,puzzlesToday} from './utils/loadData.js';
let group='publications';
</script>
<main><header><a href="../../../../../index.html" target="_top">← Samples</a><span>THE PUDDING / 2020 ARCHIVE</span></header>
<section class="intro"><p class="eyebrow">PLAY THE PUZZLE. SEE WHO IS IN IT.</p><h1>Who comes to mind?</h1><p>Thirteen original mini crosswords turn a study of representation into something you can play. Solve a puzzle, then highlight the people behind its clues.</p><p class="credit">By Russell Samora, Michelle Pera-McGhee & Amelia Wattenberger · <a href="https://pudding.cool/2020/11/crossword-puzzles/" target="_blank" rel="noopener">Original ↗</a> · <a href="SAMPLE.md">Review notes</a></p></section>
<nav aria-label="Puzzle collection"><button class:chosen={group==='publications'} on:click={()=>group='publications'}>5 publications · 2020</button><button class:chosen={group==='decades'} on:click={()=>group='decades'}>NYT · 8 decades</button></nav>
{#key group}<Play id="puzzle" puzzles={group==='publications'?puzzlesToday:puzzlesNYT} title={group==='publications'?'Major Publications in 2020':'New York Times by Decade'}/>{/key}
<footer><p>Each mini has 10 clues. The original study’s percentages were rounded to the nearest 10% when constructing these puzzles. The findings describe the study’s historical dataset, not current publications.</p><details><summary>How were these made?</summary><p>The authors used Saul Pwanson’s crossword database and their analysis of named people in clues and answers. Their race and gender classifications and methodology remain those of the original 2020 study.</p><p><a href="https://pudding.cool/2020/11/crossword/#methodology" target="_blank" rel="noopener">Read the original study and methodology ↗</a></p></details></footer></main>
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