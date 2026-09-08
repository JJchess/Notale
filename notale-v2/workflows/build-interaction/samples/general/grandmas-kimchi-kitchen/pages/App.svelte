<script>
import {onMount,tick} from 'svelte';import Scene from './scene.svelte';import PreScene from './prescene.svelte';import CutScene from './cutscene.svelte';import Sound from './sound.svelte';import copy from './copy.json';
let chapter=2,run=0,hints=[],scene,insideWidth=1200,scrolled=false,scrolledY=false,scrollAmount=0,eventClicked=0,soundon=false,frame,mode=false;
$: height=insideWidth>620?insideWidth*7/11:insideWidth*14/11;
function prepare(){let clickCounter=0;return JSON.parse(JSON.stringify(copy.scene2)).map((d,num)=>({...d,num,keyboardSelect:'False',clickCounter:d.notouch!=='none'&&d.hed!=='speaker'?clickCounter++:-1,xPos:(+d.x>25&&+d.x<50)||+d.x>75?'right':'left',yPos:+d.y>50?'bottom':'top',addclass:d.addclass||'',notouch:d.notouch||'',clickable:d.clicked==='false'}))}
hints=prepare();
async function restart(target=2){hints=prepare();run++;chapter=target;scrolled=false;scrolledY=false;scrollAmount=0;await tick();if(frame){frame.scrollLeft=0;frame.focus({preventScroll:true})}}
function onScroll(){scrollAmount=frame.scrollLeft;if(scrollAmount>10)scrolled=true}
function visibility(){if(document.hidden)soundon=false}
onMount(()=>{window.kimchiKitchen={getState:()=>({chapter,soundon,hints,...(scene?.getState()||{})})};document.body.dataset.ready='true';document.addEventListener('visibilitychange',visibility);return()=>document.removeEventListener('visibilitychange',visibility)});
</script>
<header><a href="../../../../../index.html" target="_top">← Samples</a><span>Alvin Chang / The Pudding · 2023</span></header><main><div class="heading"><div><p class="eyebrow">THE SEARCH FOR MY KIMCHI · FALL 1996</p><h1>Grandma’s kitchen</h1></div><div class="chapter-tools"><button on:click={()=>restart(1)}>Read the opening</button><button on:click={()=>restart(2)}>Start the kitchen again</button></div></div><p class="lead">You’re nine, in Kansas. Grandma is making fresh kimchi. Find the four ingredients she asks for, and explore the memories around her kitchen.</p>
<Sound chapter={Math.min(chapter,3)} bind:eventClicked {mode} bind:soundon/>
<div class="scene" tabindex="-1" bind:this={frame} bind:clientWidth={insideWidth} style:height={height+'px'} on:scroll={onScroll}>
{#key run}
{#if chapter===1}<PreScene chapter={1} w={insideWidth} h={height} maxWidth={1200} cutsceneText={copy.scene1} bind:chapterTracker={chapter}/>
{:else if chapter===2}<Scene bind:this={scene} chapter={2} bind:chapterTracker={chapter} hoverHints={hints} bind:eventClicked bind:scrolled bind:scrolledY bind:scrollAmount/>
{:else if chapter===3}<CutScene chapter={3} w={insideWidth} h={height} maxWidth={1200} cutsceneText={copy.scene3} bind:chapterTracker={chapter}/>
{:else}<div class="ending"><img src="assets/kimchi/scene2/kimchi.png" alt="Grandma’s freshly made kimchi"><h2>“You’ll never forget this flavor.”</h2><p>The 1996 chapter ends here. Continue the original story to follow the search through 2005, 2015 and 2022.</p><button on:click={()=>restart(2)}>Return to the kitchen</button><a href="https://pudding.cool/2023/05/kimchi/" target="_blank" rel="noopener">Continue the original story ↗</a></div>{/if}
{/key}
</div><p class="help">Select an object to explore. Collect garlic, gochugaru, salt and sugar, then taste the kimchi. On a phone, swipe the room sideways. Tab and Enter select objects; Escape closes an enlarged image.</p></main><footer><a href="https://pudding.cool/2023/05/kimchi/" target="_blank" rel="noopener">Original story</a> · <a href="SAMPLE.md">Review notes</a><p>Original layered artwork, dialogue, illustrations, music and chapter transitions. An approved local sample.</p></footer>
