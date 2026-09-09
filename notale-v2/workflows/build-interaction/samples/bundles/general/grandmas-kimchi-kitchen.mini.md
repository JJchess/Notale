<sample id="grandmas-kimchi-kitchen" category="general" variant="mini">
  <file path="samples/general/grandmas-kimchi-kitchen/mini/pages/index.html">
```html
<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Grandma’s kitchen · 1996</title><script type="module" crossorigin src="./build/assets/index-587706de.js"></script>
<link rel="stylesheet" href="./build/assets/index-69b968e7.css">

<link rel="stylesheet" href="mini-scrollbars.css"><body><div id="app"></div></body></html>
```
  </file>
  <file path="samples/general/grandmas-kimchi-kitchen/mini/pages/App.svelte">
```svelte
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
<header><a href="../../../../../../index.html" target="_top">← Samples</a><span>Alvin Chang / The Pudding · 2023</span></header><main><aside class="story"><div class="heading"><div><p class="eyebrow">THE SEARCH FOR MY KIMCHI · FALL 1996</p><h1>Grandma’s kitchen</h1></div><div class="chapter-tools"><button on:click={()=>restart(1)}>Read the opening</button><button on:click={()=>restart(2)}>Start the kitchen again</button></div></div><p class="lead">You’re nine, in Kansas. Grandma is making fresh kimchi. Find the four ingredients she asks for, and explore the memories around her kitchen.</p>
<p class="help">Select an object to explore. Collect garlic, gochugaru, salt and sugar, then taste the kimchi. On a phone, swipe the room sideways. Tab and Enter select objects; Escape closes an enlarged image.</p></aside><Sound chapter={Math.min(chapter,3)} bind:eventClicked {mode} bind:soundon/>
<div class="scene" tabindex="-1" bind:this={frame} bind:clientWidth={insideWidth} style:height={height+'px'} on:scroll={onScroll}>
{#key run}
{#if chapter===1}<PreScene chapter={1} w={insideWidth} h={height} maxWidth={1200} cutsceneText={copy.scene1} bind:chapterTracker={chapter}/>
{:else if chapter===2}<Scene bind:this={scene} chapter={2} bind:chapterTracker={chapter} hoverHints={hints} bind:eventClicked bind:scrolled bind:scrolledY bind:scrollAmount/>
{:else if chapter===3}<CutScene chapter={3} w={insideWidth} h={height} maxWidth={1200} cutsceneText={copy.scene3} bind:chapterTracker={chapter}/>
{:else}<div class="ending"><img src="assets/kimchi/scene2/kimchi.png" alt="Grandma’s freshly made kimchi"><h2>“You’ll never forget this flavor.”</h2><p>The 1996 chapter ends here. Continue the original story to follow the search through 2005, 2015 and 2022.</p><button on:click={()=>restart(2)}>Return to the kitchen</button><a href="https://pudding.cool/2023/05/kimchi/" target="_blank" rel="noopener">Continue the original story ↗</a></div>{/if}
{/key}
</div></main><footer><a href="https://pudding.cool/2023/05/kimchi/" target="_blank" rel="noopener">Original story</a> · <a href="SAMPLE.md">Review notes</a><p>Original layered artwork, dialogue, illustrations, music and chapter transitions. An approved local sample.</p></footer>
```
  </file>
  <file path="samples/general/grandmas-kimchi-kitchen/mini/pages/copy.json">
```json
{
  "scene1": [
    "<strong>Fall 1996</strong> <span>Tap or press down to continue</span>",
    "It's Saturday morning. You're a 9-year-old  living in Kansas with your Korean-American family.",
    "You're dreaming about Pokemon and basketball.",
    "That's when you hear several gallons of water being poured out into the kitchen sink.",
    "It's Grandma.",
    "You can only speak broken Korean, so communication with her is limited. But you know exactly what these sounds mean.",
    "Today is kimchi day – one of the few days a year Grandma makes fresh kimchi.",
    "There are 365 days in the year. On four or five of those days, Grandma makes fresh kimchi.",
    "Unfortunately, most of those are school days – and you're told that if you eat kimchi before school, your breath will stink. So you avoid it.",
    "But on the rare weekend she makes kimchi, you get to taste the incredibly fresh and salty concoction before it gets shoved into jars and ferments into a sour and spicy side dish.",
    "It's your absolute favorite.",
    "So, you grab your Game Boy and run downstairs to the kitchen to find Grandma mixing things in a giant bowl."
  ],
  "scene2": [
    {
      "type": "smallImage",
      "hed": "",
      "words": "Grandma's slippers",
      "image": "shoes.png",
      "alt": "floral shoes",
      "x": "46.55",
      "y": "64.00",
      "width": "166",
      "clicked": "true"
    },
    {
      "type": "smallImage",
      "hed": "",
      "words": "",
      "image": "fridge.png",
      "alt": "Fridge",
      "x": "2",
      "y": "5",
      "width": "917",
      "notouch": "none",
      "clicked": "true"
    },
    {
      "type": "bigImage",
      "hed": "",
      "words": "",
      "image": "poster1.png",
      "alt": "Line chart showing drastic improvement in South Korea nutrition since the mid-1900s.",
      "x": "10.36",
      "y": "11.71",
      "width": "177",
      "clicked": "true"
    },
    {
      "type": "bigImage",
      "hed": "",
      "words": "",
      "image": "poster2.png",
      "alt": "Line chart showing Korean immigration to the US, which ramped up in the 1980s.",
      "x": "10.91",
      "y": "37.14",
      "width": "113",
      "clicked": "true"
    },
    {
      "type": "smallImage",
      "hed": "",
      "words": "Hi Rainbow. Why did we name a white dog Rainbow?",
      "image": "dog.png",
      "alt": "A small white dog sleeping.",
      "x": "69.09",
      "y": "71.29",
      "width": "310",
      "clicked": "true",
      "addclass": "snoozing"
    },
    {
      "type": "smallImage",
      "hed": "",
      "words": "Rainbow gets fed later. Don't miss the kimchi!",
      "image": "dog-food.png",
      "alt": "Dog food and water bowl on a mat.",
      "x": "83.91",
      "y": "48.57",
      "width": "320",
      "clicked": "true"
    },
    {
      "type": "smallImage",
      "hed": "",
      "words": "",
      "image": "cabinets.png",
      "alt": "Kitchen cabinets",
      "x": "39.9",
      "y": "0",
      "width": "978",
      "clicked": "true",
      "notouch": "none"
    },
    {
      "type": "smallImage",
      "hed": "",
      "words": "Looks like Grandma already added the daikon.",
      "image": "daikon.png",
      "alt": "Daikon.",
      "x": "52.82",
      "y": "26",
      "width": "197",
      "clicked": "true"
    },
    {
      "type": "smallImage",
      "hed": "",
      "words": "Mom and Dad getting at their wedding reception. The women in the family made all the food, including the kimchi.",
      "image": "pic2.png",
      "alt": "Two people sitting in front of a table with kimchi.",
      "x": "51.73",
      "y": "47",
      "width": "177",
      "clicked": "true"
    },
    {
      "type": "smallImage",
      "hed": "",
      "words": "My brother didn't want kimchi on his first birthday.",
      "image": "pic3.png",
      "alt": "Picture showing a child being served kimchi by an adult.",
      "x": "65.00",
      "y": "47",
      "width": "205",
      "clicked": "true"
    },
    {
      "type": "smallImage",
      "hed": "",
      "words": "My third birthday. Pizza and kimchi!",
      "image": "pic1.png",
      "alt": "A child's sitting at a table with pizza and kimchi.",
      "x": "66.09",
      "y": "36.71",
      "width": "167",
      "clicked": "true"
    },
    {
      "type": "bigImage",
      "hed": "",
      "words": "",
      "image": "books.png",
      "alt": "A handful of books on a bookcase.",
      "x": "42.00",
      "y": "33.8",
      "width": "343",
      "clicked": "true"
    },
    {
      "type": "smallImage",
      "hed": "",
      "words": "Grandma always has a super sharp knife.",
      "image": "knives.png",
      "alt": "Knife",
      "x": "64.64",
      "y": "19.57",
      "width": "75",
      "clicked": "true"
    },
    {
      "type": "smallImage",
      "hed": "",
      "words": "I love our Korean vase. Let's hope I don't shatter this family heirloom in a few years.",
      "image": "vase.png",
      "alt": "Korean vase.",
      "x": "70.5",
      "y": "15.86",
      "width": "175",
      "clicked": "true"
    },
    {
      "type": "smallImage",
      "hed": "speaker",
      "words": "",
      "alt": "TK",
      "x": "21.00",
      "y": "35.43",
      "width": "0",
      "clicked": "true",
      "addclass": "speaker"
    },
    {
      "type": "smallImage",
      "hed": "",
      "words": "♥ ♥ Taste later ♥ ♥",
      "image": "grandma.png",
      "alt": "Korean grandma with curly hair.",
      "x": "17.00",
      "y": "35.43",
      "width": "331",
      "clicked": "true",
      "addclass": "",
      "notouch": "none"
    },
    {
      "type": "smallImage",
      "hed": "",
      "words": "Kimchi-back",
      "image": "bucket-back.png",
      "alt": "Back of kimchi container.",
      "x": "13.18",
      "y": "56.00",
      "width": "550",
      "clicked": "true",
      "notouch": "none"
    },
    {
      "type": "smallImage",
      "hed": "",
      "words": "Korean grandma's arms",
      "image": "grandma-arms.png",
      "alt": "Korean grandma's arms",
      "x": "17",
      "y": "46.14",
      "width": "356",
      "clicked": "true",
      "notouch": "none",
      "addclass": "updown"
    },
    {
      "type": "smallImage",
      "hed": "",
      "words": "Korean grandma's feet",
      "image": "grandma-feet.png",
      "alt": "Korean grandma's feet",
      "x": "6.82",
      "y": "62.71",
      "width": "784",
      "clicked": "true",
      "notouch": "none"
    },
    {
      "type": "smallImage",
      "hed": "",
      "words": "Front of kimchi bucket",
      "image": "bucket-front.png",
      "alt": "Front of kimchi container",
      "x": "13.18",
      "y": "56.00",
      "width": "550",
      "clicked": "true",
      "notouch": "none"
    },
    {
      "type": "smallImage",
      "hed": "",
      "words": "So much garlic.",
      "image": "garlic.png",
      "alt": "Garlic",
      "x": "32.73",
      "y": "78.86",
      "width": "164",
      "clicked": "false",
      "prompt": "Hand me the garlic, then go feed Rainbow.",
      "response": "OK good. Go play now."
    },
    {
      "type": "smallImage",
      "hed": "",
      "words": "It's Korean red pepper flakes.",
      "image": "gochugaru.png",
      "alt": "Red pepper bag.",
      "x": "17.36",
      "y": "72.14",
      "width": "145",
      "clicked": "false",
      "prompt": "Men shouldn't have their hands stained by gochugaru.",
      "response": "Boys shouldn't be in the kitchen."
    },
    {
      "type": "smallImage",
      "hed": "Grandma:",
      "words": "What's so special about Korean sea salt?",
      "image": "salt.png",
      "alt": "Purple salt box.",
      "x": "8",
      "y": "69.29",
      "width": "217",
      "clicked": "false",
      "prompt": "Boys don't make kimchi. Go study.",
      "response": "Go watch TV. I'll give you some later."
    },
    {
      "type": "smallImage",
      "hed": "Grandma:",
      "words": "Did she use the onion?",
      "image": "onion.png",
      "alt": "Onion",
      "x": "40.64",
      "y": "72.43",
      "width": "136",
      "clicked": "true"
    },
    {
      "type": "smallImage",
      "hed": "sugar",
      "words": "Grandma is putting spices in random containers again.",
      "image": "sugar.png",
      "alt": "Sugar",
      "x": "24.09",
      "y": "70.29",
      "width": "168",
      "clicked": "false",
      "prompt": "Pass me the sugar and go play.",
      "response": "It's better to make many jars of kimchi at once."
    }
  ],
  "scene3": [
    "You ask Grandma for a taste.",
    "She uses her yellow rubber gloves to reach into the kimchi basin. She rips off a piece of kimchi, rolls it into a bite-size shape, and plops it into your mouth.",
    "Yesssssssssss",
    "YESSSSSSSSSSSSS",
    "Bright, salty…",
    "And, whoa, there's the garlic and spice.",
    "The leafy parts of the cabbage hold onto so much flavor. The white, fibrous parts have yet to take in the marinade, so it gives your palette a sweet relief. It's a pleasing cycle – bright, salty, spicy, funky, sweetness.",
    "You want to ask her how she makes this kimchi. But not only is there a language barrier.",
    "Sometimes, you would overhear Korean women at church saying that men ruin kimchi. So no one teaches you.",
    "How will this family recipe ever get passed down? Who cares! Today is kimchi day! You want another bite.",
    "You'll never forget this flavor."
  ]
}
```
  </file>
  <file path="samples/general/grandmas-kimchi-kitchen/mini/pages/cutscene.svelte">
```svelte
<script>
	import P5 from 'p5-svelte';
	import { slide, fade, fly } from 'svelte/transition';
	import { onMount, onDestroy } from 'svelte';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let textTimer;
  let redrawStill = () => {};
  onDestroy(() => clearTimeout(textTimer));
	export let chapter;
	export let w;
	export let h;
	export let maxWidth;
	export let chapterTracker = Number(chapter);
	let running = true;
	let blankScreen = 0;
	let delayNumber = 1000;
	export let cutsceneText;
	let cutsceneStage = 0;
	let stageText = cutsceneText;
	let opacityAmount = 40;
	let lastScene = "";
	let insideWords;
	let fullheight = 0;	
	
	// let typeClick = 0;
	// function resetTypewriter() {
	// 	typeClick = 1;
	// }
	
	onMount(async () => {
		fullheight = insideWords?.scrollHeight || 0;
		blankScreen = 0;
	});
	
	function onKeyDown(e) {
 if(e.target.closest("button,a,input,select,textarea"))return;
 if([37,38,39,40,13,49].includes(e.keyCode))e.preventDefault();
		if (e.keyCode == 37 || e.keyCode == 38) {
			 next(1);
		 }
		 if (e.keyCode == 39 || e.keyCode == 40 || e.keyCode == 13 || e.keyCode == 49) {
			 next();
		 }
	}
	
	function next(prev) {
		
		if (cutsceneStage < stageText.length) {
			if (prev == 1 && cutsceneStage > 0) {
				cutsceneStage--;
			} else if (prev != 1) {
				cutsceneStage++;
			}
			delayNumber = 0;
			opacityAmount = 255;
			
			if (cutsceneStage > stageText.length - 1) {
				running = false;
				if ( chapterTracker < 14) {
					chapterTracker = chapterTracker + 1;
				} else {
					chapterTracker = 0;
				}
			}
			mx = getRandomInt(w);
			my = getRandomInt(h);
			xVel = randomIntFromInterval(-90,90);
			yVel = randomIntFromInterval(-90,90);
		}
		clearTimeout(textTimer);
    textTimer = setTimeout(function() {
      redrawStill();
			try {
				fullheight = insideWords?.scrollHeight || 0;
			} catch(e) {
			}	
		},10);	
	}
	
	let cellSize = 60;
	let ballX = 20
	let ballY = h/2
	let xVel = randomIntFromInterval(-40,40);
	let yVel = randomIntFromInterval(-40,40);
	let mx = getRandomInt(w);
	let my = getRandomInt(h);
	let diagonalLength = Math.sqrt(w*w + h*h);
	let counter = 0;
	let randomizer = randomIntFromInterval(-20,20);
	const sketch = (p) => {
		let img;
    redrawStill = () => { if (reduced && img?.width > 1) p.redraw(40); };
		p.setup = () => {
			p.createCanvas(w, h);
			p.background(0);
			p.noStroke();
      if (reduced) p.noLoop();
			if (chapter < 12) {
				img = p.loadImage(`assets/kimchi/kimchibg.png`, loaded => { img = loaded; if (reduced) p.redraw(40); });
			} else {
				img = p.loadImage(`assets/kimchi/kimchibg-2.png`, loaded => { img = loaded; if (reduced) p.redraw(40); });
			}
			
			p.frameRate(20);
		};
	
		p.windowResized = () => { requestAnimationFrame(() => { p.resizeCanvas(w, h); if (reduced) p.redraw(40); }); };

    p.draw = () => {
      if (!img || img.width < 2) return;
			if (running) {
				if (chapter == 12 && blankScreen == 4) {
					p.background([255,255,255, 40]);
				} else if (chapter == 3 || chapter == 12) {
					p.background([100,0,40,10]);
				}
				
				for (let x = 0; x < w/cellSize; x += 1) {
					for (let y = 0; y < h/cellSize; y += 1) {
						let xCoord = (x*cellSize/w * img.width);
						let yCoord = (y*cellSize/h * img.height);
						let dist = getDistance(xCoord,yCoord,ballX,ballY);
						if (yCoord > img.width) {
							yCoord = img.width;
						}
						let randomSeeker = Math.round(xCoord) + randomizer;
						if (xCoord + randomSeeker > img.width/cellSize) {
							randomSeeker = Math.round(img.width/cellSize);
						}
						let c1 = img.get(xCoord, yCoord);
						cellSize = w/40 + Math.round(dist*20);
						if (chapter == 3) {
							c1[3] = 10;
						}
						if (chapter == 6) {
							c1[0] *= 0.1;
							c1[1] *= 0.7;
							c1[2] *= 0.7; 
							c1[3] = 10;
						}
						if (chapter == 9) {
							c1[0] *= 1.1;
							c1[1] *= 0.6;
							c1[2] *= 0.6; 
							c1[3] = 20;
							cellSize *= 1.4;
						}
						if (chapter == 12) {
							c1[0] *= 1.5;
							c1[1] *= 1.1;
							c1[2] *= 1.1; 
							c1[3] = 20;
						}
						if (blankScreen == 2) {
							c1[0] *= 1.5;
							c1[1] *= 0;
							c1[2] *= 0; 
							c1[3] = opacityAmount*0.1;
						}
						if (blankScreen == 4) {
							c1[0] *= 0.2;
							c1[1] *= 0.2;
							c1[2] *= 0.1; 
							c1[3] = opacityAmount*0.005;
							cellSize = w/20;
						}
						p.fill(c1);
						let x1 = x*cellSize;
						let y1 = y*cellSize;
						let quadRand = dist*90*p.random(0.5,1);
						let quadRand2 = dist*90*p.random(0.5,1);
						let quadRand3 = dist*90*p.random(0.5,1);
						p.quad(x1-quadRand2,y1-quadRand3,x1+cellSize-quadRand2,y1-quadRand3,x1+quadRand*2,y1+cellSize,x1-quadRand,y1+cellSize+quadRand)
					}
			  	}
			  	counter++;
			  	changeBall();
		  	}
		};
		
		function getDistance(x,y,bx,by) {
			bx = bx + Math.sin(counter/10)*200;
			if (chapter == 8) {
				by = by + Math.cos(counter/10)*200;
			}
			var a = x - bx;
			var b = y - by;
			return Math.sqrt( a*a + b*b ) / diagonalLength;
		}
		
		
		function changeBall() {
			if (ballX < mx) {
			  xVel = Math.sqrt(Math.abs(ballX - mx))*6;
			} else if (ballX > mx) {
			  xVel = -Math.sqrt(Math.abs(mx - ballX))*6;
			}
			if (ballY < my) {
			  yVel = Math.sqrt(Math.abs(ballY - my))*6;
			} else if (ballY > my) {
			  yVel = -Math.sqrt(Math.abs(my - ballY))*6;
			}
			ballX += xVel;
			ballY += yVel;
		  }
	};
		
	function getRandomInt(max) {
		return Math.floor(Math.random() * max);
	}
		
	function randomIntFromInterval(min, max) { // min and max included 
		return Math.floor(Math.random() * (max - min + 1) + min)
	}
	
	function opacityMunge(number, stage) {
		let opacity = number / stage;
		if (number == 0 && stage == 0) { opacity = 1; }
		if (opacity == 0) {return 0.1;}
		else if (opacity == 1) {return 1;}
		else {return opacity / 2; }
	}
	  
	$: {
		fullheight = fullheight;
		chapterTracker = chapterTracker;
		cutsceneStage = cutsceneStage;
		w = w;
		if (w >= maxWidth) {
			h = maxWidth * 7/11;
		} else if (w > 620) {
			h = (w) * 7/11;
		} else {
			h = (w) * 14/11;
		}
		if (stageText[cutsceneStage] == "…") {
			blankScreen++;
		}
		h = h;
	}
</script>
<svelte:window on:keydown={onKeyDown}/>
<div class="sceneInside cutscene"  on:click={next}>
	<div class="visualContainer">
		<P5 {sketch} />
	</div>
	<div class="introWords sceneNum{blankScreen}">
		<div class="insideIntroWords" bind:this={insideWords} style="max-height:{fullheight}px;">
			{#each stageText as text, i}
				{#if i <= cutsceneStage}
					<p style="opacity:{opacityMunge(i, cutsceneStage)};">{@html stageText[i]}</p>
				{/if}
			{/each}
		<!-- {#if typeClick == 0}
		<Typewriter interval={[90,10,15,1,2,12,20,2,5,10,14,10,20,8,14,30]}  on:done={resetTypewriter}>
		{stageText[cutsceneStage]}
		</Typewriter>
		{:else} -->
			<!-- {@html stageText[cutsceneStage]} -->
		<!-- {/if} -->
		</div>
	</div>
</div>

<style>
	.cutscene { cursor: pointer; z-index: 99; }
	.sceneInside {
		background: black;
	}
	.sceneNum4 {
		color: black !important;
		text-shadow: none;
	}
</style>
```
  </file>
  <file path="samples/general/grandmas-kimchi-kitchen/mini/pages/main.js">
```javascript
import App from './App.svelte';new App({target:document.querySelector('#app')});
```
  </file>
  <file path="samples/general/grandmas-kimchi-kitchen/mini/pages/prescene.svelte">
```svelte
<script>
	import P5 from 'p5-svelte';
	import { slide, fade, fly } from 'svelte/transition';
	import { onMount, onDestroy } from 'svelte';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let textTimer;
  let redrawStill = () => {};
  onDestroy(() => clearTimeout(textTimer));
	export let chapter;
	export let w;
	export let h;
	export let maxWidth;
	export let chapterTracker = Number(chapter);
	let running = true;
	let delayNumber = 0;
	let blankScreen = 0;
	let insideWords;
	let fullheight = 0;	
	
	export let cutsceneText;
	let cutsceneStage = 0;
	let stageText = cutsceneText;
	let opacityAmount = 40;

	onMount(async () => {
		fullheight = insideWords?.scrollHeight || 0;
	});
	
	let typeClick = 0;
	function resetTypewriter() {
		typeClick = 1;
	}
	
	function onKeyDown(e) {
 if(e.target.closest("button,a,input,select,textarea"))return;
 if([37,38,39,40,13,49].includes(e.keyCode))e.preventDefault();
		if (e.keyCode == 37 || e.keyCode == 38) {
			 next(1);
		 } else if (e.keyCode == 39 || e.keyCode == 40 || e.keyCode == 13 || e.keyCode == 49) {
			 next();
		 }
	}
	
	function next(prev) {
		if (cutsceneStage < stageText.length) {
			// if (typeClick != 0) {
			// 	cutsceneStage++;
			// 	typeClick = 0;
			// } else {
			// 	typeClick++;
			// }
			if (prev == 1 && cutsceneStage > 0) {
				cutsceneStage--;
			} else if (prev != 1) {
				cutsceneStage++;
			}
			
			delayNumber = 0;
			opacityAmount = 255;
			
			if (cutsceneStage > stageText.length - 1) {
				running = false;
				if ( chapterTracker < 13) {
					chapterTracker = chapterTracker + 1;
				} else {
					chapterTracker = 0;
				}
			}
			mx = getRandomInt(w);
			my = getRandomInt(h);
			xVel = randomIntFromInterval(-90,90);
			yVel = randomIntFromInterval(-90,90);
		}
		clearTimeout(textTimer);
    textTimer = setTimeout(function() {
      redrawStill();
			fullheight = insideWords?.scrollHeight || 0;
		},10);
	}
	
	let cellSize = 60;
	let ballX = 20
	let ballY = h/2
	let xVel = randomIntFromInterval(-40,40);
	let yVel = randomIntFromInterval(-40,40);
	let mx = getRandomInt(w);
	let my = getRandomInt(h);
	let diagonalLength = Math.sqrt(w*w + h*h);
	let counter = 0;
	let randomizer = randomIntFromInterval(-20,20);
	const sketch = (p) => {
		let img;
    redrawStill = () => { if (reduced && img?.width > 1) p.redraw(40); };
		p.setup = () => {
			p.createCanvas(w, h);
			p.background(0);
			p.noStroke();
      if (reduced) p.noLoop();
			if (chapter == 1) {
				img = p.loadImage(`assets/kimchi/bg-1.jpg`, loaded => { img = loaded; if (reduced) p.redraw(40); });
			} else if (chapter < 12) {
				img = p.loadImage(`assets/kimchi/kimchibg.png`, loaded => { img = loaded; if (reduced) p.redraw(40); });
			} else {
				img = p.loadImage(`assets/kimchi/kimchibg-2.png`, loaded => { img = loaded; if (reduced) p.redraw(40); });
			}
			// p.frameRate(20);
		};
	
		p.windowResized = () => { requestAnimationFrame(() => { p.resizeCanvas(w, h); if (reduced) p.redraw(40); }); };

    p.draw = () => {
      if (!img || img.width < 2) return;
			if (running) {
				p.background([0,0,0,2]);
				for (let x = 0; x < w/cellSize; x += 1) {
					for (let y = 0; y < h/cellSize; y += 1) {
						let xCoord = (x*cellSize/w * img.width);
						let yCoord = (y*cellSize/h * img.height);
						let dist = getDistance(xCoord,yCoord,ballX,ballY);
						if (yCoord > img.width) {
							yCoord = img.width;
						}
						let randomSeeker = Math.round(xCoord) + randomizer;
						if (xCoord + randomSeeker > img.width/cellSize) {
							randomSeeker = Math.round(img.width/cellSize);
						}
						let c1 = img.get(xCoord, yCoord);
						cellSize = p.constrain(w/20 + Math.round(dist*20),30,200);
												
						if (chapter == 1) {
							c1[0] *= 0.7;
							c1[1] *= 0.7;
							c1[2] *= 0.7; 
							c1[3] = 8;
						}
						if (chapter == 4) {
							c1[0] *= 0.1;
							c1[1] *= 0.6;
							c1[2] *= 0.6; 
							c1[3] = 20;
							cellSize *= 1.4;
						}
						if (chapter == 7) {
							c1[0] *= 0.6;
							c1[1] *= 7;
							c1[2] *= 2; 
							c1[3] = 6;
						}
						if (chapter == 10) {
							c1[0] *= 0.5;
							c1[1] *= 0.1;
							c1[2] *= 1.5; 
							c1[3] = 8;
						}
						if (chapter == 13) {
							c1[0] *= 0.1;
							c1[1] *= 0.1;
							c1[2] *= 1.1; 
							c1[3] = 20;
						}
						if (cutsceneStage == 0) {
							c1[3] = 0;
						}
						p.fill(c1);
						let rand = dist*90*p.random(0.5,1);
						p.ellipse(x*cellSize,y*cellSize,cellSize*1.2+rand,cellSize*1.2+rand);
						//p.rect(x*cellSize,y*cellSize,cellSize,cellSize);
					}
			  	}
			  	counter++;
			  	changeBall();
		  	}
		};
		
		function getDistance(x,y,bx,by) {
			bx = bx + Math.sin(counter/chapter*4)*40;
			by = by + Math.cos(counter/chapter*4)*40;
			var a = x - bx;
			var b = y - by;
			return Math.sqrt( a*a + b*b ) / diagonalLength;
		}
		
		
		function changeBall() {
			if (ballX < mx) {
			  xVel = Math.sqrt(Math.abs(ballX - mx))*6;
			} else if (ballX > mx) {
			  xVel = -Math.sqrt(Math.abs(mx - ballX))*6;
			}
			if (ballY < my) {
			  yVel = Math.sqrt(Math.abs(ballY - my))*6;
			} else if (ballY > my) {
			  yVel = -Math.sqrt(Math.abs(my - ballY))*6;
			}
			ballX += xVel;
			ballY += yVel;
		  }
	};
		
	function getRandomInt(max) {
		return Math.floor(Math.random() * max);
	}
		
	function randomIntFromInterval(min, max) { // min and max included 
		return Math.floor(Math.random() * (max - min + 1) + min)
	}
	
	function opacityMunge(number, stage) {
		let opacity = number / stage;
		if (number == 0 && stage == 0) { opacity = 1; }
		if (opacity == 0) {return 0.1;}
		else if (opacity == 1) {return 1;}
		else {return opacity / 2; }
	}
	 
	
	  
	$: {
		stageText = stageText;
		chapterTracker = chapterTracker;
		cutsceneStage = cutsceneStage;
		w = w;
		if (w >= maxWidth) {
			h = maxWidth * 7/11;
		} else if (w > 620) {
			h = (w) * 7/11;
		} else {
			h = (w) * 14/11;
		}
		if (stageText[cutsceneStage] == "…") {
			blankScreen++;
		}
		h = h;
	}
</script>
<svelte:window on:keydown={onKeyDown}/>
<div class="sceneInside cutscene"  on:click={next} out:fade="{{duration: 200}}">
	<div class="visualContainer">
		<P5 {sketch} />
	</div>
	<div class="introWords">
		<!-- <div class="insideIntroWords">
		{#if stageText[cutsceneStage] != undefined}
			{#if typeClick == 0}
			<Typewriter interval={[90,10,15,1,2,12,20,2,5,10,14,10,20,8,14,30]} delay={delayNumber} on:done={resetTypewriter}>
			{stageText[cutsceneStage]}
			</Typewriter>
			{:else}
				{@html stageText[cutsceneStage]}
			{/if}
		{/if}
		</div> -->
		<div class="insideIntroWords" bind:this={insideWords} style="max-height:{fullheight}px;">
			{#each stageText as text, i}
				{#if i <= cutsceneStage}
					<p style="opacity:{opacityMunge(i, cutsceneStage)};">{@html stageText[i]}</p>
				{/if}
			{/each}
		</div>
	</div>
	

</div>

<style>
	.cutscene { cursor: pointer; }
	.sceneInside {
		background: black;
	}
</style>
```
  </file>
  <file path="samples/general/grandmas-kimchi-kitchen/mini/pages/scene.svelte">
```svelte
<script>
	import Typewriter from 'svelte-typewriter';
	import { fade } from 'svelte/transition';
	import { onMount, onDestroy, tick } from 'svelte';
 let timers=[];const delay=(fn,ms)=>{const id=setTimeout(fn,ms);timers.push(id);return id};onDestroy(()=>timers.forEach(clearTimeout));
 export function getState(){return {hoverHints,allClicked,readyForNext,selectedHint,modalShown}};
	// determines which scene to show
	export let chapter;
	export let chapterTracker = Number(chapter);
	export let hoverHints;
	export let eventClicked;
	let cutsceneStage = 0;
	let sceneOffset = "rightSide";
	let displayMode = "display";
	let modalShown = false;
	let allClicked = false;
	let readyForNext = false;
	let hed, words, type, image, alt;
	let fullWidth = 2200/100;
	let bounce = "";
	export let scrolled;
	export let scrolledY;
	export let scrollAmount;
	  
	let selectedHint = null;
	let hintResponse = null;
	
	let maxHints = 0;
	onMount(async () => {
		cutsceneStage = 0;
		for (let i = 0; i < hoverHints.length; i++) {
			hoverHints[i].clicked = "false";
			if (hoverHints[i].clickCounter > maxHints) {
				maxHints = hoverHints[i].clickCounter; 
			}
		}
	});
	
	let keyboardInteraction = false;
	let firstReady = true;
	function showModal(e) {
		closeModal();
		if (!keyboardInteraction) {
			for (let i = 0; i < hoverHints.length; i++) {
				hoverHints[i].keyboardSelect = "False";
			} 
		}
		if (eventClicked != 3) {
			hed = (e.currentTarget || e.target).getAttribute("hed");
			words = (e.currentTarget || e.target).getAttribute("words");
			type = (e.currentTarget || e.target).getAttribute("type");
			image = "scene" + chapter + "/" + (e.currentTarget || e.target).getAttribute("image");
			alt = hoverHints[Number((e.currentTarget || e.target).getAttribute("num"))]?.alt || "Original illustration";
			selectedHint = Number((e.currentTarget || e.target).getAttribute("num"));
			
			if (hoverHints[selectedHint].clickable && hoverHints[selectedHint].clicked == "false") {
				eventClicked = 2;
			} else if (hoverHints[selectedHint].clickable == false) {
				eventClicked = 1;
			}
			
			hoverHints[selectedHint].clicked = true;
			
			if (type == "bigImage") {
				scrolledY = false;
				modalShown = true;
 tick().then(()=>document.querySelector(".closeModal")?.focus());
			}
			
			/// then in 4 seconds, show the picture again
			delay(function() {
				if (allClicked) {
					readyForNext = true;
					bounce = "";
					if (firstReady) {
						selectedHint = null;
						firstReady = false;
					}
				}
			}, 6000);
			checkAllClicked();
		}
	}
	
	function closeModal() {
		if (eventClicked != 3) {
			if(modalShown) document.querySelector(`.hintContainer[num="${selectedHint}"]`)?.focus();
 modalShown = false;
			selectedHint = null;
			checkAllClicked();
		}
	}
	
	let keyboardSelected = -1;
	function onKeyDown(e) {
 if(e.key === "Escape"){closeModal();return;}
 if(modalShown && e.key === "Tab"){e.preventDefault();document.querySelector(".closeModal")?.focus();return;}
 if(![37,38,39,40].includes(e.keyCode))return;
 if(modalShown || e.target.closest("button,a,input,select,textarea"))return;
 e.preventDefault();
		keyboardInteraction = true;
		if (e.keyCode == 37 || e.keyCode == 38) {
			keyboardSelected--;
		}
		if (e.keyCode == 39 || e.keyCode == 40 || e.keyCode == 13) {
			 keyboardSelected++;
		}
		if (e.keyCode == 13 && allClicked && readyForNext) {
			 nextChapter();
		}
		if (keyboardSelected > maxHints) {
			keyboardSelected = 0;
		}
		if (keyboardSelected < 0) {
			keyboardSelected = maxHints;
		}
		for (let i = 0; i < hoverHints.length; i++) {
			if (hoverHints[i].clickCounter == keyboardSelected) {
				hoverHints[i].keyboardSelect = "True";
			} else {
				hoverHints[i].keyboardSelect = "False";
			}
		} 
		delay(function() {
			const element = {"target": document.querySelector('.keyboardSelectTrue') };
			showModal(element);
		},50);
	}
	
	let hintImage = [];
	let hintPrompt = {
		"2": "Bring me these ingredients. <div class='quote_hint'><img src='assets/kimchi/universal/keyboard.png'/></div>",
		"5": "Find these ingredients",
		"8": "Look at the menu and watch TV!",
		"11": "I need a few more things..." 
	};
	let answerPrompt = {
		"2": "Kimchi is almost ready!",
		"5": "Let's mix and taste.",
		"8": "Your food is coming soon!",
		"11": "OK, the kimchi is almost ready!" 
	};
	// Checking if all modals have been clicked
	function checkAllClicked() {
		allClicked = true;
		hintImage = [];
		hoverHints.forEach(function(d) {
			if (d.clicked == "false" && d.clickable) {
				allClicked = false;
			}
			if (d.clickable) {
				if (d.clicked == "false") {
					hintImage.push([d.image,"unclicked"]);
				} else {
					hintImage.push([d.image,"clicked"]);
				}
			}
		});
	}
	
	function nextChapter() {
		chapterTracker = chapterTracker + 1;
		displayMode = "none";
	}
	
	let clickedPos = {x:0,y:0};
	function getPosition(e) {
		clickedPos.x = e.offsetX/e.srcElement.width*100;
		clickedPos.y = e.offsetY/e.srcElement.height*100;
	}
	
	Array.prototype.randFromArray = function(){
	  return this[Math.floor(chapter/13*this.length)];
	}
	
	$: {
		cutsceneStage = cutsceneStage;
		if (chapterTracker == chapter) {
			displayMode = "block";
		}
		hoverHints = hoverHints;
		modalShown = modalShown;
		hed = hed;
		words = words;
		type = type;
		image = image;
		allClicked = allClicked;
		chapterTracker = chapterTracker;
		sceneOffset = sceneOffset;
		checkAllClicked();
	}
</script>
<svelte:window on:keydown={onKeyDown}/>
	<div class="sceneInside {sceneOffset}" style="display:{displayMode}"  in:fade>
		<img class="sceneImage" alt="scene of grandma making kimchi" src="assets/kimchi/scene{chapter}/background.png" on:click={closeModal} draggable="false"/>
		
		{#each hoverHints as hint}
			<!-- {#if (hint.clickable == true && hint.clicked == "false") || (hint.clickable == false) || (hint.keeponpage == "true")} -->
				<button class="hintContainer keyboardSelect{hint.keyboardSelect} {hint.addclass} touch{hint.notouch} clickable-{hint.clickable}-{hint.clicked}" class:selected="{selectedHint === hint.num}" style="width:{hint.width/fullWidth}%; left:{hint.x}%; top:{hint.y}%; pointer-events: {hint.notouch};" on:click={showModal} hed={hint.hed} words={hint.words} type={hint.type} num={hint.num} image={hint.image} clickable={hint.clickable} aria-label={hint.hed || hint.alt} tabindex={hint.notouch === "none" || hint.hed === "speaker" ? -1 : 0}>
				
					{#if hint.notouch != "none"}
						<div class="hintShadow"></div>
					{/if}
				
					{#if hint.image != undefined}
						
						{#if hint.width > 500}
							<img class="hoverHint bigItem" alt="{hint.alt}" src="assets/kimchi/scene{chapter}/{hint.image}"   draggable="false"/>
						{:else}
							<img class="hoverHint smallItem" alt="{hint.alt}" src="assets/kimchi/scene{chapter}/{hint.image}" draggable="false"/>
						{/if}
					{/if}
					
					{#if hint.addclass == "speaker" || hint.addclass == "updown2 speaker" || hint.addclass == "speaker sidespeaker"}
						<div class="quotebox perma {bounce} {hint.xPos}">
								{#if !allClicked}
									<span in:fade>{@html hintPrompt[chapter]}</span>
								{:else if !readyForNext}
									<span in:fade>{answerPrompt[chapter]}</span>
								{/if}
							
							{#if readyForNext}
							<div class="buttonWrapper">
								<img class="eatkimchi" src="assets/kimchi/scene{chapter}/kimchi.png" alt="kimchi" in:fade/>
								<button class="button bounce2" on:click|stopPropagation={nextChapter} style="left:{scrollAmount}px;">Eat kimchi<div class="button_hint">Click or press enter</div></button>
							</div>
							{:else}
								<div class="hintImageContainer">
									{#each hintImage as himage}
										<div class="hintImage {himage[1]}">
											<img src="assets/kimchi/scene{chapter}/{himage[0]}" alt={hint.alt}/>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{:else if hint.type != "bigImage"}
						<div class="quotebox {hint.xPos} {hint.yPos}">
							{hint.words}
						</div>
					{/if}
				</button>
		{/each}
	</div>

	{#if modalShown && !scrolledY}
		<div class="modal {type}" role="dialog" aria-modal="true" aria-label={alt} transition:fade="{{duration: 200}}" on:click={closeModal}>
			{#if type == "bigImage"}
				<object class="mobileImage" aria-label="{alt}" type="image/svg+xml" data="assets/kimchi/mobile/{image.replace('.png','.svg')}" on:click={closeModal}>
					<img class="mobileImage" alt="{alt}" src="assets/kimchi/mobile/{image.replace('.png','.svg')}" draggable="false"/>
				</object>
				
				<object class="desktopImage" aria-label="{alt}" type="image/svg+xml" data="assets/kimchi/desktop/{image.replace('.png','.svg')}" on:click={closeModal}>
					<img class="desktopImage" alt="{alt}" src="assets/kimchi/desktop/{image.replace('.png','.svg')}" draggable="false"/>
				</object>

				<!-- <img class="mobileImage" alt="{alt}" src="assets/kimchi/mobile/{image.replace('.png','.svg')}" draggable="false"/>
				<img class="desktopImage" alt="{alt}" src="assets/kimchi/desktop/{image.replace('.png','.svg')}" draggable="false"/> -->
			{/if}
			<button class="closeModal" type="button" on:click={closeModal}>Close · Escape</button>
		</div>
	{/if}
	{#if !scrolled}
		<div class="swipeHint" out:fade>
			<img src="assets/kimchi/hand.png" alt="hint to swipe on mobile"/>
		</div>
	{/if}
<style>
	.modal object {
		pointer-events: none;
	}
	.sceneInside {
		background: black;
		font-family: "National 2 Web", -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif !important;
		user-select: none;
	}
	.debugger {
		position: fixed;
		right: 10px;
		bottom: 10px;
		color: black;
	}
	.hintContainer {
		position: absolute;
		cursor: pointer;
		background: none;
		padding: 0 !important;
	}
	.hoverHint {
		/* position: absolute; */
		pointer-events: none;
		background: none;
		left: 0;
		top: 0;
		width: 100%;
		height: 100%;
		/* pointer-events: none; */
		-webkit-touch-callout: none;
		-webkit-user-select: none; 
	 	-khtml-user-select: none; 
	   	-moz-user-select: none; 
			-ms-user-select: none; 
				user-select: none;
	}
	.hintContainer.clickable-false-false img  {
		filter: drop-shadow(1px 1px 5px rgba(255,255,159, 1));
	}
	.hintContainer.clickable-false-false.touchnone img, .hintContainer.speaker img  {
		filter: none;
	}
	.hintContainer.clickable-true-false img  {
		animation: pulse-dropshadow 2s infinite;
	}
	.hintContainer.clickable-true-false:hover img  {
		animation: pulse-dropshadowhover 2s infinite;
	}
	.hintContainer:hover img   {
		filter: contrast(1.3) brightness(1.2); 		/* margin-top: -2px; */
	}
	.hintContainer.keyboardSelectTrue img {
		filter: contrast(1.3) brightness(1.2) drop-shadow(1px 1px 5px rgba(255,255,159, 1));
	}
	.hintContainer.sidehover:hover  {
		margin-top: 0px !important;
		margin-left: -4px !important;
	}
	.hintContainer:hover .perma img {
		filter: none;
	}

	.clickable-true-true img {
		-webkit-filter: saturate(0%) brightness(.6) !important;
	    filter: saturate(0%) brightness(.6) !important;
	}
	.hintBubble {
		width: 14px;
		height: 14px;
		background: #F9D594;
		border-radius: 50%;
		position: absolute;
		bottom: 20px;
		left: 20%;
		/* transform: translateX(-50%); */
		border: 1px solid #666;
		pointer-events: none;
		box-shadow: 0px 0px 3px 3px rgba(0,0,0,0.2);
	}
	.hintBubble.accent {
		width: 20px;
		height: 20px;
		background: #FFD141;
		animation: pulse-black 2s infinite;
	}
	.clickable-false-true .hintBubble {
		background: rgba(0,0,0,0.2);
		animation: none;
		box-shadow: none;
	}
	.clickable-true-true .hintBubble {
		background: gray;
		animation: none;
	}
	
	
	.quotebox {
		background: rgba(235,204,253,1);
		font-size: 15px;
		position: absolute;
		bottom: calc(100% + 15px);
		left: 50%;
		width: 170px;
		color: #480073;
		padding: 5px 7px;
		z-index: 999;
		display: none;
		text-align: left;
		line-height: 17px;
		box-shadow: 0px 0px 20px #35283D;
		z-index: 90;
	}
	.quotebox.top {
		bottom: auto;
		top: calc(100% + 15px);
	}
	.quotebox.bottom {
		bottom: calc(100% + 15px);
		top: auto;
	}
	.quotebox.left {
		left: 10px;
	}
	.quotebox.right {
		left: auto;
		right: 10px;
	}
	.hintContainer.selected .quotebox {
		display: block;
	}
	.hintContainer .quotebox.perma {
		display: block !important;
		background: white;
		color: black;
		width: 220px;
		padding: 9px;
		box-shadow: 0px 0px 45px #000;
		pointer-events: none;
		font-size: 16px;
		line-height: 18px;
		font-weight: bold;
		color: #444745;
	}
	.sidespeaker.hintContainer .quotebox.perma {
		top: auto;
		bottom: -10px;
		right: 20px;
		left: auto;
	}
	.bounce {animation: bounce 3s infinite;}
	.bounce2 {animation: bounce2 3s infinite; position: relative; pointer-events: auto;}
	.hintContainer .quotebox.perma img {
		margin-right: 5px;
	}
	.quotebox.perma .response {
		display: none;
	}
	.quotebox .quoteText {
		display: inline-block;
		vertical-align: center;
	}
	.quotebox img {
		float: left;
		width: 40px;
		margin-right: 3px;
	}
	.hintImageContainer {
		display: block;
		margin-top: 5px;
	}
	.quotebox .hintImage {
		display: inline-block;
		width: 25%;
		height: auto;
		position: relative;
	}
	.quotebox .clicked img {
		filter: saturate(0%) brightness(1.5) !important;
		-webkit-filter: saturate(0%) brightness(1.5) !important;
	}
	.quotebox .clicked::after {
		content: "x";
		color: red;
		position: absolute;
		left: 50%;
		bottom: 2%;
		font-size: 35px;
		text-shadow: 0px 0px 2px #000;
		transform: translate(-50%, -50%);
	}
	.eatkimchi {
		position: relative;
		left: 25%;
		width: 50% !important;
		filter: none !important;
	}
	.buttonWrapper {
		position: relative;
		width: 100%;
	}
	.buttonWrapper button.button {
		left: 50% !important;
		margin-left: -3px;
		transform: translateX(-50%);
		font-size: 16px !important;
		font-weight: bold;
		padding: 3px 8px;
	}
	@media screen and (max-width: 620px) {
		.quotebox img {
			width: 30px;
			margin-right: 4px;
		}
	}
	.quotebox::before {
		content: "";
		position: absolute;
		top: 100%;
		left: calc(50% - 10px);
		right: 10px;
		bottom: 10px;
		width: 0;
		height: 0;
		border-style: solid;
		border-width: 10px 10px 0 10px;
		border-color: rgba(235,204,253,1) transparent transparent transparent;
	}
	.quotebox.top::before  {
		border-width: 0px 10px 10px 10px;
		border-color: transparent transparent rgba(235,204,253,1) transparent;
		bottom: 100%;
		top: auto;
	}
	.quotebox.left::before { right: auto; left: 10px; }
	.quotebox.right::before { left: auto; right: 10px; } 
	.hintContainer .quotebox.perma::before {
		border-color: white transparent transparent transparent;
	}
	.sidespeaker.hintContainer .quotebox.perma::before {
		left: 86%;
		/* left: 99%;
		top: 75%;
		border-top: 10px solid transparent;
		border-bottom: 10px solid transparent;
		border-left: 10px solid white; */
	}
	
	
	/* animations */
	.updown {
		animation: updown-animation 3s infinite;
	}
	.updown2 {
		animation: updown-animation2 3s infinite;
	}
	.snoozing {
		animation: snoozing-animation 2.5s infinite;
	}
	@keyframes bounce {
	  0% {
		margin-bottom: 0px;
	  }
	 
		5% {
		  margin-bottom: 10px;
		}
		
		10% {
		  margin-bottom: 0px;
		}
		
		15% {
		  margin-bottom: 15px;
		}
		60% {
		  margin-bottom: 0px;
		}
	  100% {
		margin-bottom: 0px;
	  }
	}
	@keyframes bounce2 {
	  0% {
		bottom: 0px;
	  }
	 
		5% {
		  bottom: 5px;
		}
		
		10% {
		  bottom: 0px;
		}
		
		15% {
		  bottom: 7px;
		}
		60% {
		  bottom: 0px;
		}
	  100% {
		bottom: 0px;
	  }
	}
	
	@keyframes pulse-black {
	  0% {
		transform: scale(0.95);
		box-shadow: 0 0 0 0 rgba(0,0,0, 0.6);
	  }
	  
	  70% {
		transform: scale(1);
		box-shadow: 0 0 0 30px rgba(0,0,0, 0);
	  }
	  
	  100% {
		transform: scale(0.95);
		box-shadow: 0 0 0 0 rgba(255,161,65,  0);
	  }
	}
	
	@keyframes pulse-dropshadow {
	  0% {
		transform: scale(0.95);
		filter: drop-shadow(1px 1px 10px rgba(255,255,200, 1));
	  }
	  
	  60% {
		transform: scale(1);
		filter: drop-shadow(1px 1px 30px rgba(255,255,200, 1));
	  }
	  
	  100% {
		transform: scale(0.95);
		filter: drop-shadow(1px 1px 10px rgba(255,255,200, 1));
	  }
	}
	@keyframes pulse-dropshadowhover {
	  0% {
		transform: scale(0.95);
		filter: drop-shadow(1px 1px 10px rgba(255,255,200, 1))  brightness(1.4);
	  }
	  
	  60% {
		transform: scale(1);
		filter: drop-shadow(1px 1px 30px rgba(255,255,200, 1))  brightness(1.4);
	  }
	  
	  100% {
		transform: scale(0.95);
		filter: drop-shadow(1px 1px 10px rgba(255,255,200, 1))  brightness(1.4);
	  }
	}
	
	@keyframes updown-animation {
	  0% {
		height: 15%;
	  }
	 
		20% {
		  height: 17%;
		}
		
		40% {
		  height: 15%;
		}
		
		60% {
		  height: 20%;
		}
		80% {
		  height: 21%;
		}
	  100% {
		height: 15%;
	  }
	}
	@keyframes updown-animation2 {
  	0% {
		margin-top: 0%;
		height: 50%;
  	}
  	20% {
	  	margin-top: -0.3%;
		height: 50.3%;
  	}
  	40% {
	  	margin-top: 0.3%;
	  	height: 49.7%;
		}
		60% {
			margin-top: -0.3%;
	  	height: 50.3%;
		}
		80% {
			margin-top: 0.3%;
	  	height: 49.7%;
		}
  	100% {
	  	margin-top: 0%;
	  	height: 50%;
		}
	}
	@keyframes snoozing-animation {
		0% {
			margin-top: 0%;
			height: 13%;
		}
	
		40% {
			margin-top: -0.4%;
			height: 13.4%;
		}
	
		100% {
			height: 13%;
			margin-top: 0%;
		}
	}
	/* MODALS */
	.modal {
		cursor: pointer;
		user-select: none;
		font-size: 1.8vw;
		line-height: 2.7vw;
		position: absolute;
		left: 50%;
		bottom: 50%;
		/* transform: translate(-50%, -50%); */
		background: rgba(0,0,0,0.8);
		color: white;
		/* border: 2px solid #000; */
		padding: 15px 10px;
		width: calc(100% - 20px);
		max-height: 95%;
		z-index: 99999;
	}
	.modal.bigImage {
		left: 0px;
		bottom: 0px;
		width: 100%;
		height: 100% !important;
		padding: 0;
		margin: 0;
		max-height: none;
		z-index: 999;
		
	}
	.modal.bigImage img, .modal.bigImage object {
		width: 90%;
		left: 5%;
		top: 50%;
		position: absolute;
		transform: translate(0%, -50%);
		/* transform: rotate(1deg); */
	}
	.modal .mobileImage {
		display: none;
	}
	
	.closeModal {
		position: absolute;
		left: 50%;
		transform: translateX(-50%);
		top: calc(100% - 35px);
		color: #222;
		font-family: var(--sans);
		font-size: 16px;
		z-index: 1000;
	}
	@media screen and (max-width: 880px) {
		.modal  {
			font-size: 17px;
			line-height: 22px;
		}
	}
	
	@media screen and (max-width: 620px) {
		.modal.bigImage img {
			width: 100%;
			left: 0%;
			top: 50%;
			position: absolute;
			transform: translate(0%, -50%);
			/* transform: rotate(1deg); */
		}
		.modal  {
			font-size: 16px;
			line-height: 20px;
			position: fixed;
		}
		.modal .mobileImage {
			display: block;
		}
		.modal .desktopImage {
			display: none;
		}
		.closeModal {
			position: absolute;
			left: 50%;
			transform: translateX(-50%);
			top: 30px;
		}
	}
	
	.modal .modalWords { pointer-events: none; }
	.modal .modalWords span {
		font-weight: 100;
		opacity: 0.6;
		pointer-events: none;
	}
	.modal .modalWords .hed {
		font-weight: 500;
		opacity: 1;
	}
	
	
	
	/* WORDS ONLY */
	.modal.words img {
		display: none;
	}
	
	
	/* BIG IMAGE */
	
	.modal.bigImage .modalWords {
		position: absolute;
		width: 80%;
		left: 50%;
		transform: translateX(-50%); 
		max-width: 600px;
		text-align: center;
	}
	
	.modal .modalWords {
		position: relative;
		left: 0px;
		width: 100%;
	}
	
	.swipeHint {
		position: absolute;
		left: 70%;
		bottom: 35%;
		width: 50px;
		height: 50px;
		transform: translateX(-50%);
		animation: swipe-animation 1.5s infinite;
		display: none;
		user-select: none;
		pointer-events: none;
	}
	@media screen and (max-width: 620px) {
		.swipeHint { display: block; }
	}
	@keyframes swipe-animation{
		0% {
			left: 70%;
		}
	
		70% {
			left: 20%;
		}

		100% {
			left: 70%;
		}
	}
</style>
```
  </file>
  <file path="samples/general/grandmas-kimchi-kitchen/mini/pages/sound.svelte">
```svelte
<script>
	import * as Tone from 'tone'
	import { onMount,onDestroy } from 'svelte';
 const pendingNotes = new Set();
 const delay = (callback, ms) => { const id = setTimeout(() => { pendingNotes.delete(id); callback(); }, ms); pendingNotes.add(id); return id; };
 onDestroy(()=>{mounted=false;clearInterval(songTimer);clearInterval(eventTimer);pendingNotes.forEach(clearTimeout);synth?.dispose()});
	export let chapter;
	export let mode;
	export let eventClicked;
	let synth;
	let now;
	let mounted = false;
	export let soundon;
	let measure = 4000;
	let scales = ["A","Bb","B","C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B","C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B","C","Db","D","Eb","E","F","Gb","G","Ab"];
	let baseKey = 8;
	let key = baseKey;
	let progressionStep = -1;
	
	let chordProgressionLookup = {
"1": ["happy","anthem"],
"2": ["happy","anthem"],
"3": ["upbeat","peppy"]
}
	
	let songLookup = {
"anthem": [
			["1",measure/64/1000,2,0.5, true],
			["2",measure/64/1000,4,-1, true],
			["2",measure/64/1000,3,-1, true],
			["3",measure/16/1000,4, 0.5, true],
			["4",measure/64/1000,5, 0.5, false],
			["4",measure/64/1000,3, 0.5, false]
		],
"peppy": [
			["1",measure/64/1000,1,0.5, true],
			["2",measure/32/1000,4,-1, false],
			["3",measure/32/1000,3, 0.5, false],
			["4",measure/64/1000,3, 0.5, false],
			["4",measure/32/1000,4, 0.5, false]
		]
} 
	
	// each has 16
	let chordProgression = {
"happy": [
			[0, "M"],
			[4, "M"],
			[2, "m"],
			[5, "M"],
			[0, "M"],
			[4, "M"],
			[2, "m"],
			[5, "M"]
		],
"upbeat": [
			[0, "M"],
			[5, "M"],
			[2, "m"],
			[7, "M"],
			[0, "M"],
			[5, "M"],
			[2, "m"],
			[7, "M"]
		]
};
	let chord = "M";
	let chords = {
"M": [0, 4, 7],
"m": [0, 3, 7]
}
	
	onMount(async () => {
		synth = new Tone.PolySynth(Tone.Synth).toDestination();
		now = Tone.now();
		mounted = true;
	});
	
	async function soundToggle() {
 await Tone.start();
		soundon = !soundon;
		play("C8",0.05);
	}
	
	function play(n, length) {
		if (mounted) {
			if (soundon) {
				now = Tone.now();
				synth.triggerAttack(n, now);
			}
			synth.triggerRelease([n], now + length);
		}
	}

	let counter = 0;
	let songPlayed = false;
	const songTimer=setInterval(song, measure/24);
	function song() {
		if (mounted && soundon) {
			if (counter % 16 == 0 || counter == 0) {
				let currentProgression = chordProgression[chordProgressionLookup[chapter][0]];
				progressionStep +=1;
				if (progressionStep >= currentProgression.length - 1) {
					progressionStep = 0;
				}
				key = currentProgression[progressionStep][0];
				chord = currentProgression[progressionStep][1];
				//console.log(scales[key], chord);
			}

			let currentSong = songLookup[chordProgressionLookup[chapter][1]];
			for (let i = 0; i < currentSong.length; i++) {
				playNote(currentSong[i]);
			}
		} else if (mounted) {
			Tone.Transport.pause();
		}
		if (songPlayed) {
			counter++;
		}
	}
	
	function playNote(song) {
		songPlayed = true;
		let pitch = song[0];
		let len = song[1];
		let interval = song[2];
		let rand = song[3];
		let chordKey = song[4];
		if (counter % interval == 0 && 64-(counter%64) > len ) {
			let keyShift = key;
			if (!chordKey) {
				let keyRand = chords[chord].randFromArray();
				keyShift = key + keyRand;
			}
			let m = scales[keyShift];
			if (rand == -1 || Math.random() < rand ) {
				if (pitch == "4" || pitch == "3") {
					if (counter > 16) {
						play(m + pitch, len);
					}
				} else {
					play(m + pitch, len);
				}
			}
		}
	}
	
	const eventTimer=setInterval(function() {
		if (eventClicked == 1) {
			play("C8",0.05);
			eventClicked = 0;
		} 
		if (eventClicked == 3) {
			play("C6",0.05);
			delay(function() {
				play("G6",0.05);
				eventClicked = 0;
			},50);
		} 
		if (eventClicked == 2) {
			play("C7",0.05);
			delay(function() {
				play("E7",0.05);
			},50);
			delay(function() {
				play("G7",0.05);
			},100)
			delay(function() {
				play("Bb7",0.1);
			},150)
			eventClicked = 0;
		}
	},10);
	
	function onKeyDown(e) {
		if (e.keyCode == 32 && !e.target.closest("button,a,input,select,textarea")) {
 e.preventDefault();
			soundToggle();
		}
	}
	

	Array.prototype.randFromArray = function(){
	  return this[Math.floor(Math.random()*this.length)];
	}
	let oldChapter = -1;
	$: {
		if (chapter != oldChapter) {
			progressionStep = -1;
			oldChapter = chapter;
		}
		chapter = chapter;
		soundon = soundon;
 if(mounted && !soundon)synth.releaseAll();
		mode = mode;
	}
</script>	
<svelte:window on:keydown={onKeyDown}/>
<div class="soundbar">
		<button class="soundbutton" on:click={soundToggle}>
			{#if soundon}
				<img class="soundIcon" alt="sound on button" src="assets/kimchi/universal/sound-on-dark.png"/>
				Sound: on
			{:else}
				<img class="soundIcon" alt="sound off button" src="assets/kimchi/universal/sound-off-dark.png"/>
				Sound: off
			{/if}
		</button>
</div>
<style>
	.soundbar { margin: 0px auto; text-align: right; max-width: 1200px; position: relative; height: 23px; width: 100%;}
	.soundbutton {
		position: absolute;
		cursor: pointer;
		display: inline-block;
		/* position: absolute; */
		right: 0px;
		top: 0px;
		/* background: rgba(0,0,0,0.1); */
		width: 120px;
		font-size: 18px;
		border-radius: 0%;
		color: black;
		text-align: left;
		z-index: 999;
		user-select: none;
		background: none;
		margin: 0px auto;
		padding: 0px 0px 2px;
	}
	.soundbutton.light {
		color: white;
	}
	.soundbutton img {
		width: 20px;
		height: 20px;
		margin-right: 5px;
		float: left;
	}
	.soundbutton:hover {
		opacity: 0.6;
	}
</style>
```
  </file>
  <file path="samples/general/grandmas-kimchi-kitchen/mini/pages/variables.css">
```css
/**
 * Do not edit directly
 * Generated on Tue, 31 May 2022 13:42:06 GMT
 */

:root {
  --category-blue: #4477AA;
  --category-red: #EE6677;
  --category-green: #228833;
  --category-yellow: #CCBB44;
  --category-cyan: #66CCEE;
  --category-purple: #AA3377;
  --category-gray: #BBBBBB;
  --color-black: #000000;
  --color-white: #ffffff;
  --color-gray-50: #f7f7f7;
  --color-gray-100: #efefef;
  --color-gray-200: #dfdfdf;
  --color-gray-300: #cacaca;
  --color-gray-400: #a8a8a8;
  --color-gray-500: #878787;
  --color-gray-600: #6d6d6d;
  --color-gray-700: #4e4e4e;
  --color-gray-800: #373737;
  --color-gray-900: #262626;
  --color-gray-1000: #191919;
  --color-purple: #a239ca;
  --color-blue: #4717f6;
  --color-green: #34a29e;
  --color-red: #ff533d;
  --color-yellow: #e5e338;
  --12px: 0.75rem;
  --14px: 0.875rem;
  --16px: 1rem;
  --18px: 1.125rem;
  --20px: 1.25rem;
  --22px: 1.375rem;
  --24px: 1.5rem;
  --28px: 1.75rem;
  --32px: 2rem;
  --36px: 2.25rem;
  --40px: 2.5rem;
  --44px: 2.75rem;
  --48px: 3rem;
  --56px: 3.5rem;
  --64px: 4rem;
  --80px: 5rem;
  --96px: 6rem;
  --112px: 7rem;
  --128px: 8rem;
}
```
  </file>
  <file path="samples/general/grandmas-kimchi-kitchen/mini/pages/style.css">
```css
body{margin:0;background:#efede7;font-family:"National 2 Web",sans-serif;overflow-x:visible}header,main,footer{max-width:1248px;margin:auto;padding:22px 24px}header{display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid #d2cdc5;font-size:13px}a{color:inherit;text-underline-offset:4px}.heading{display:flex;align-items:center;justify-content:space-between;gap:25px;margin-top:8px}.eyebrow{font-size:12px;letter-spacing:1.8px;color:#7d0056;margin:0 0 8px}h1{font-size:43px;line-height:1.1;margin:0}.chapter-tools{display:flex;gap:8px}button{font:inherit;cursor:pointer}.chapter-tools button,.ending button{background:#fff;border:1px solid #222;padding:9px 13px;font-size:14px}.lead{font-size:18px;max-width:850px;line-height:1.55;margin:20px 0 25px}.scene{max-width:1200px;width:100%;margin:0 auto;overflow-x:hidden;overscroll-behavior-x:none;position:relative;box-sizing:content-box;border:2px solid #000;background:black;scrollbar-width:none}.scene::-webkit-scrollbar{display:none}.help{font-size:14px;line-height:1.6;color:#615b53;max-width:850px;margin:20px 0}.soundbar{margin-bottom:8px!important}.ending{height:100%;padding:30px;background:#efe9d6;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:20px}.ending img{max-width:260px;max-height:35%;object-fit:contain}.ending h2{font-size:28px;margin:0}.ending p{max-width:500px;margin:0;line-height:1.6}.ending a{font-size:14px}.closeModal{z-index:1000;background:#fff;padding:9px!important;border:2px solid #222!important;font:16px "National 2 Web"!important}.hintContainer:focus-visible{outline:3px solid #fff;outline-offset:3px}.chapter-tools button:focus-visible,a:focus-visible,.closeModal:focus-visible{outline:3px solid #9b005b;outline-offset:4px}footer{border-top:1px solid #d2cdc5;font-size:13px;color:#615b53}footer p{margin-top:10px}@media(max-width:620px){header,main,footer{padding:18px 14px}header{font-size:11px}header span{max-width:160px;text-align:right}.heading{display:block}h1{font-size:35px}.chapter-tools{margin-top:18px;flex-wrap:wrap}.chapter-tools button{padding:8px 10px;font-size:13px}.lead{font-size:16px}.scene{overflow-x:auto}.help{font-size:13px}.ending{min-width:100%}.ending h2{font-size:22px}.ending img{max-height:25%}.ending p{font-size:15px}.sceneInside .quotebox.perma{font-size:15px}.sceneInside .quotebox.perma .button{font-size:13px!important}.scene .closeModal{max-width:90%}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}


/* The full room remains visible, with persistent chapter and sound controls. */
@media(min-width:1200px) and (min-height:700px){
 #app{height:900px;display:grid;grid-template-rows:60px minmax(0,1fr) 64px}header,footer{width:100%;max-width:1600px;padding:16px 28px}footer{padding:8px 28px;font-size:12px}footer p{margin:4px 0}main{height:100%;width:100%;max-width:1600px;min-height:0;padding:16px 28px;display:grid;grid-template-columns:280px minmax(0,1fr);grid-template-rows:28px minmax(0,1fr);gap:12px 40px}.story{grid-row:1/3;min-height:0}.heading{display:block;margin:0}.eyebrow{font-size:11px;line-height:1.6;letter-spacing:1.3px}h1{font-size:43px;line-height:1.1}.chapter-tools{flex-direction:column;align-items:start;margin-top:24px;gap:10px}.lead{font-size:17px;line-height:1.6;margin:24px 0}.help{font-size:14px;line-height:1.7;margin:0;padding-top:20px;border-top:1px solid #d2cdc5}
 #app .scene>.sceneInside,#app .scene>.ending{position:absolute;top:0;left:0}.scene{grid-column:2;max-width:1080px;align-self:start}.soundbar{grid-column:2;max-width:1084px!important;margin-bottom:0!important}.ending{box-sizing:border-box;width:100%}#app .scene .closeModal{top:auto;bottom:12px;margin:0}#app .scene .modal.bigImage img,#app .scene .modal.bigImage object{max-height:calc(100% - 84px);top:calc(50% - 24px);object-fit:contain}
}
```
  </file>
  <file path="samples/general/grandmas-kimchi-kitchen/mini/pages/normalize.css">
```css
/*! normalize.css v8.0.1 | MIT License | github.com/necolas/normalize.css */

/* Document
   ========================================================================== */

/**
 * 1. Correct the line height in all browsers.
 * 2. Prevent adjustments of font size after orientation changes in iOS.
 */

html {
  line-height: 1.15; /* 1 */
  -webkit-text-size-adjust: 100%; /* 2 */
}

/* Sections
   ========================================================================== */

/**
 * Remove the margin in all browsers.
 */

body {
  margin: 0;
}

/**
 * Render the `main` element consistently in IE.
 */

main {
  display: block;
}

/**
 * Correct the font size and margin on `h1` elements within `section` and
 * `article` contexts in Chrome, Firefox, and Safari.
 */

h1 {
  font-size: 2em;
  margin: 0.67em 0;
}

/* Grouping content
   ========================================================================== */

/**
 * 1. Add the correct box sizing in Firefox.
 * 2. Show the overflow in Edge and IE.
 */

hr {
  box-sizing: content-box; /* 1 */
  height: 0; /* 1 */
  overflow: visible; /* 2 */
}

/**
 * 1. Correct the inheritance and scaling of font size in all browsers.
 * 2. Correct the odd `em` font sizing in all browsers.
 */

pre {
  font-family: monospace, monospace; /* 1 */
  font-size: 1em; /* 2 */
}

/* Text-level semantics
   ========================================================================== */

/**
 * Remove the gray background on active links in IE 10.
 */

a {
  background-color: transparent;
}

/**
 * 1. Remove the bottom border in Chrome 57-
 * 2. Add the correct text decoration in Chrome, Edge, IE, Opera, and Safari.
 */

abbr[title] {
  border-bottom: none; /* 1 */
  text-decoration: underline; /* 2 */
  text-decoration: underline dotted; /* 2 */
}

/**
 * Add the correct font weight in Chrome, Edge, and Safari.
 */

b,
strong {
  font-weight: bolder;
}

/**
 * 1. Correct the inheritance and scaling of font size in all browsers.
 * 2. Correct the odd `em` font sizing in all browsers.
 */

code,
kbd,
samp {
  font-family: monospace, monospace; /* 1 */
  font-size: 1em; /* 2 */
}

/**
 * Add the correct font size in all browsers.
 */

small {
  font-size: 80%;
}

/**
 * Prevent `sub` and `sup` elements from affecting the line height in
 * all browsers.
 */

sub,
sup {
  font-size: 75%;
  line-height: 0;
  position: relative;
  vertical-align: baseline;
}

sub {
  bottom: -0.25em;
}

sup {
  top: -0.5em;
}

/* Embedded content
   ========================================================================== */

/**
 * Remove the border on images inside links in IE 10.
 */

img {
  border-style: none;
}

/* Forms
   ========================================================================== */

/**
 * 1. Change the font styles in all browsers.
 * 2. Remove the margin in Firefox and Safari.
 */

button,
input,
optgroup,
select,
textarea {
  font-family: inherit; /* 1 */
  font-size: 100%; /* 1 */
  line-height: 1.15; /* 1 */
  margin: 0; /* 2 */
}

/**
 * Show the overflow in IE.
 * 1. Show the overflow in Edge.
 */

button,
input { /* 1 */
  overflow: visible;
}

/**
 * Remove the inheritance of text transform in Edge, Firefox, and IE.
 * 1. Remove the inheritance of text transform in Firefox.
 */

button,
select { /* 1 */
  text-transform: none;
}

/**
 * Correct the inability to style clickable types in iOS and Safari.
 */

button,
[type="button"],
[type="reset"],
[type="submit"] {
  -webkit-appearance: button;
}

/**
 * Remove the inner border and padding in Firefox.
 */

button::-moz-focus-inner,
[type="button"]::-moz-focus-inner,
[type="reset"]::-moz-focus-inner,
[type="submit"]::-moz-focus-inner {
  border-style: none;
  padding: 0;
}

/**
 * Restore the focus styles unset by the previous rule.
 */

button:-moz-focusring,
[type="button"]:-moz-focusring,
[type="reset"]:-moz-focusring,
[type="submit"]:-moz-focusring {
  outline: 1px dotted ButtonText;
}

/**
 * Correct the padding in Firefox.
 */

fieldset {
  padding: 0.35em 0.75em 0.625em;
}

/**
 * 1. Correct the text wrapping in Edge and IE.
 * 2. Correct the color inheritance from `fieldset` elements in IE.
 * 3. Remove the padding so developers are not caught out when they zero out
 *    `fieldset` elements in all browsers.
 */

legend {
  box-sizing: border-box; /* 1 */
  color: inherit; /* 2 */
  display: table; /* 1 */
  max-width: 100%; /* 1 */
  padding: 0; /* 3 */
  white-space: normal; /* 1 */
}

/**
 * Add the correct vertical alignment in Chrome, Firefox, and Opera.
 */

progress {
  vertical-align: baseline;
}

/**
 * Remove the default vertical scrollbar in IE 10+.
 */

textarea {
  overflow: auto;
}

/**
 * 1. Add the correct box sizing in IE 10.
 * 2. Remove the padding in IE 10.
 */

[type="checkbox"],
[type="radio"] {
  box-sizing: border-box; /* 1 */
  padding: 0; /* 2 */
}

/**
 * Correct the cursor style of increment and decrement buttons in Chrome.
 */

[type="number"]::-webkit-inner-spin-button,
[type="number"]::-webkit-outer-spin-button {
  height: auto;
}

/**
 * 1. Correct the odd appearance in Chrome and Safari.
 * 2. Correct the outline style in Safari.
 */

[type="search"] {
  -webkit-appearance: textfield; /* 1 */
  outline-offset: -2px; /* 2 */
}

/**
 * Remove the inner padding in Chrome and Safari on macOS.
 */

[type="search"]::-webkit-search-decoration {
  -webkit-appearance: none;
}

/**
 * 1. Correct the inability to style clickable types in iOS and Safari.
 * 2. Change font properties to `inherit` in Safari.
 */

::-webkit-file-upload-button {
  -webkit-appearance: button; /* 1 */
  font: inherit; /* 2 */
}

/* Interactive
   ========================================================================== */

/*
 * Add the correct display in Edge, IE 10+, and Firefox.
 */

details {
  display: block;
}

/*
 * Add the correct display in all browsers.
 */

summary {
  display: list-item;
}

/* Misc
   ========================================================================== */

/**
 * Add the correct display in IE 10+.
 */

template {
  display: none;
}

/**
 * Add the correct display in IE 10.
 */

[hidden] {
  display: none;
}



/*! https://github.com/a11yproject/a11yproject.com/blob/main/src/css/base/_resets.scss */
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  vertical-align: baseline;
}

/* Removes borders from linked images */
a img {
	border: none; 
}


b,
strong {
	font-weight: 700;
}

button,
input[type="button"] {
	border: 0;
}


em,
cite,
i {
	font-style: italic;
}

img,
figure,
picture {
	border: 0;
	display: block;
	height: auto;
	max-width: 100%;
}

h1,
h2,
h3,
h4,
h5,
h6 {
	font-weight: 500;
}

sub {
	text-transform: lowercase;
	font-size: inherit;
	font-variant-position: sub;
}

sup {
	text-transform: lowercase;
	font-variant-position: super;
}

textarea {
	overflow: auto;
	resize: vertical;
}
```
  </file>
  <file path="samples/general/grandmas-kimchi-kitchen/mini/pages/reset.css">
```css

body {
	background-color: var(--color-bg, white);
	color: var(--color-fg, black);
	line-height: 1.4;
	font-family: var(--font-body, serif);
	font-feature-settings: 'kern' 1, 'onum' 0, 'liga' 0, 'tnum' 1;
	text-rendering: optimizeLegibility;
	word-wrap: break-word;
	-webkit-tap-highlight-color: transparent;
}

h1,
h2,
h3,
h4,
h5,
h6,
p {
	margin: 16px 0;
}

mark {
	background-color: var(--color-mark, yellow);
	padding: 0 4px;
}

a {
	color: var(--color-link, blue);
	text-decoration: none;
	border-bottom: 1px solid currentColor;
}


img,
video {
	display: block;
	max-width: 100%;
	height: auto;
}

input, textarea {
	-webkit-appearance: none;
	appearance: none;
	background-color: var(--color-input-bg, whitesmoke);
	color: var(--color-input-fg, black);
	border-radius: var(--border-radius, 0);
	border: none;
	font-family: var(--font-form, sans-serif);
	font-size: inherit;
	outline: 1px solid var(--color-border, ray);
	padding: 8px;
}

button,
select,
a[role="button"],
input[type="submit"],
input[type="reset"],
input[type="button"] {
	-webkit-appearance: none;
	appearance: none;
	background-color: var(--color-button-bg, lightgray);
	color: var(--color-button-fg, black);
	border-radius: var(--border-radius, 0);
	border: none;
	font-family: var(--font-form, sans-serif);
	font-size: inherit;
	outline: none;
	padding: 8px;
	text-decoration: none;
}

button,
a[role="button"],
input[type="button"],
input[type="checkbox"],
input[type="radio"],
input[type="range"],
input[type="submit"],
input[type="reset"],
select {
	cursor: pointer;
}

input[type="button"],
input[type="range"],
input[type="submit"],
input[type="reset"],
select {
	display: inline-block;
}

button:disabled,
a[role="button"]:disabled,
input[type="button"]:disabled,
input[type="submit"]:disabled,
input[type="reset"]:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

input[type="range"] {
	-webkit-appearance: auto;
	appearance: auto;
	padding: 0;
	outline: none;
}

button:focus,
a:focus,
a[role="button"]:focus,
input:focus,
select:focus,
textarea:focus {
	outline: 2px solid var(--color-focus);
	outline-offset: 2px;
}

button:focus:not(:focus-visible),
a:focus:not(:focus-visible),
a[role="button"]:focus:not(:focus-visible),
input:focus:not(:focus-visible),
select:focus:not(:focus-visible),
textarea:focus:not(:focus-visible) {
	outline: 2px solid transparent;
}

button:disabled,
a[role="button"]:disabled,
input:disabled,
select:disabled,
textarea:disabled {
	cursor: not-allowed;
	opacity: 0.5;
}

table {
	border-collapse: collapse;
	width: 100%;
	table-layout: fixed;
}

table caption,
td,
th {
	text-align: left;
}

td,
th {
	padding: 8px 0;
	vertical-align: top;
	word-wrap: break-word;
}

thead {
	border-bottom: 1px solid var(--color-border, lightgray);
}

tfoot {
	border-top: 1px solid var(--color-border, lightgray);
}

::-moz-placeholder {
	color: var(--color-placeholder, gray);
}

:-ms-input-placeholder {
	color: var(--color-placeholder, gray);
}

::-ms-input-placeholder {
	color: var(--color-placeholder, gray);
}

::placeholder {
	color: var(--color-placeholder, gray);
}

::-moz-selection {
	background-color: var(--color-selection, lightgray);
}
::selection {
	background-color: var(--color-selection, lightgray);
}

select {
	padding-right: 24px;
	background-image: url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20256%20448%22%20enable-background%3D%22new%200%200%20256%20448%22%3E%3Cstyle%20type%3D%22text%2Fcss%22%3E.arrow%7Bfill%3A%23424242%3B%7D%3C%2Fstyle%3E%3Cpath%20class%3D%22arrow%22%20d%3D%22M255.9%20168c0-4.2-1.6-7.9-4.8-11.2-3.2-3.2-6.9-4.8-11.2-4.8H16c-4.2%200-7.9%201.6-11.2%204.8S0%20163.8%200%20168c0%204.4%201.6%208.2%204.8%2011.4l112%20112c3.1%203.1%206.8%204.6%2011.2%204.6%204.4%200%208.2-1.5%2011.4-4.6l112-112c3-3.2%204.5-7%204.5-11.4z%22%2F%3E%3C%2Fsvg%3E%0A");
	background-position: right 8px center;
	background-repeat: no-repeat;
	background-size: auto 50%;
}

ol, ul {
	padding-left: 16px;
}

.skip-to-main {
	border: none;
	width: 1px;
	height: 1px;
	overflow: hidden;
	position: absolute;
}

.skip-to-main:focus {
	background-color: var(--color-gray-900, black);
	color: var(--color-white, white);
	width: auto;
	height: auto;
	padding: 8px;
	z-index: var(--z-overlay, 1000);
}

.sr-only {
	clip: rect(0 0 0 0);
	clip-path: inset(100%);
	height: 1px;
	overflow: hidden;
	position: absolute;
	white-space: nowrap; 
	width: 1px;
}

.text-outline {
	--stroke-width: 1px;
	--stroke-width-n: calc(var(--stroke-width) * -1);
	text-shadow: var(--stroke-width-n) var(--stroke-width-n) 0 var(--color-text-outline, #fff),
		0 var(--stroke-width-n) 0 var(--color-text-outline, #fff),
		var(--stroke-width) var(--stroke-width-n) 0 var(--color-text-outline, #fff),
		var(--stroke-width) 0 0 var(--color-text-outline, #fff),
		var(--stroke-width) var(--stroke-width) 0 var(--color-text-outline, #fff),
		0 var(--stroke-width) 0 var(--color-text-outline, #fff),
		var(--stroke-width-n) var(--stroke-width) 0 var(--color-text-outline, #fff),
		var(--stroke-width-n) 0 0 var(--color-text-outline, #fff); 
}

/* desktop (mouse-enabled device) */
@media (hover: hover) and (pointer: fine) {
	button:hover,
	a[role="button"]:hover,
	input[type="button"]:hover,
	input[type="submit"]:hover,
	input[type="reset"]:hover {
		background: var(--color-button-hover, lightgray);
	}	

	button:disabled:hover,
	a[role="button"]:disabled:hover,
	input[type="button"]:disabled:hover,
	input[type="submit"]:disabled:hover,
	input[type="reset"]:disabled:hover {
		opacity: 0.5;
		cursor: not-allowed;
		background: var(--color-button-bg, lightgray);
	}
}
```
  </file>
  <file path="samples/general/grandmas-kimchi-kitchen/mini/pages/font.css">
```css
/* National */
@font-face {
	font-family: "National 2 Web";
	src: url("assets/National2Web-Regular.woff2") format("woff2");
	font-weight: 400;
	font-style: normal;
	font-stretch: normal;
	font-display: swap;
}

@font-face {
	font-family: "National 2 Web";
	src: url("assets/National2Web-Bold.woff2") format("woff2");
	font-weight: 700;
	font-style: normal;
	font-stretch: normal;
	font-display: swap;
}

/* Tiempos Text */
@font-face {
	font-family: "Tiempos Text Web";
	src: url("assets/TiemposTextWeb-Regular.woff2") format("woff2");
	font-weight: 400;
	font-style: normal;
	font-stretch: normal;
	font-display: swap;
}

@font-face {
	font-family: "Tiempos Text Web";
	src: url("assets/TiemposTextWeb-Bold.woff2") format("woff2");
	font-weight: 700;
	font-style: normal;
	font-stretch: normal;
	font-display: swap;
}
```
  </file>
  <file path="samples/general/grandmas-kimchi-kitchen/mini/pages/app.css">
```css
@import "variables.css";
@import "normalize.css";
@import "font.css";
@import "reset.css";

/* colors defined in variables.css */
:root {
	/* font */
	--sans: "National 2 Web", -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif;
	--serif: "Tiempos Text Web", Iowan Old Style, Times New Roman, Times, serif;
	--mono: Menlo, Consolas, Monaco, monospace;

	/* z-index */
	--z-bottom: -100;
	--z-middle: 0;
	--z-top: 100;
	--z-overlay: 1000;

	/* presets (used in reset.css) */
	--border-radius: 2px;
	--font-body: var(--serif);
	--font-form: var(--sans);
	--color-bg: var(--color-white);
	--color-fg: var(--color-gray-900);
	--color-primary: var(--color-black);
	--color-link: var(--color-black);
	--color-focus: var(--color-red);
	--color-mark: var(--color-yellow);
	--color-selection: var(--color-gray-300);
	--color-border: var(--color-gray-300);
	--color-button-bg: var(--color-gray-300);
	--color-button-fg: var(--color-gray-900);
	--color-button-hover: var(--color-gray-400);
	--color-input-bg: var(--color-gray-50);
	--color-input-fg: var(--color-gray-900);
	--color-placeholder: var(--color-gray-500);

	/* "1" second duration */
	--1s: 1ms;
}

@media screen and (prefers-reduced-motion: no-preference) {
	:root {
		--1s: 1s;
	}
}

body {
	background: #EEECE7;
	/* overflow-x: hidden; */
}
/* #content {padding: 0 10px; box-sizing: border-box; overflow-x: hidden; overscroll-behavior-x: none;} */
@media screen and (max-width: 1200px) {
	/* #content {padding: 0 0px; width: calc(100% + 4px); margin-left: -2px;} */
}
h1 {
	font-size: var(--48px, 48px);
}

h2 {
	font-size: var(--36px, 36px);
}

h3 {
	font-size: var(--28px, 28px);
}

h4 {
	font-size: var(--24px, 24px);
}

h5 {
	font-size: var(--22px, 22px);
}

h6 {
	font-size: var(--20px, 20px);
}

/* ----------
Kimchi styles
---------- */

.yearLabel {
	position: absolute;
	left: 10px;
	top: 10px;
	color: #000;
	font-size: 27px;
	z-index: 100;
}
.scene {min-height: 300px;}
.scene .sceneInside {
	box-sizing: border-box;
	position: relative;
	left: 0;
	top: 0;
	width: 200%;
	min-height: 300px;
	height: 100%;
	max-width: none;
	transition: left 200ms cubic-bezier(0.420, 0.000, 0.580, 1.000); /* ease-in-out */
	transition-timing-function: cubic-bezier(0.420, 0.000, 0.580, 1.000); /* ease-in-out */
}
.scene .sceneInside.leftSlide {
	left: -100%;
}
.scene .sceneInside.cutscene { width: 100% !important; }
@media screen and (min-width: 620px) {
	.scene .sceneInside {
		width: 100%;
	}
	.scene .sceneInside.leftSlide {
		left: 0%;
	}
}
.sceneImage {
	width: 100%;
}
.button {
	/* position: absolute; */
	width: 160px;
	padding: 10px;
	margin-top: 10px;
	background: white;
	border: 2px solid #000;
	box-shadow: 2px 2px 0px #000;
	color: black;
	font-size: 20px;
	cursor: pointer;
	-webkit-touch-callout: none;
	-webkit-user-select: none; 
	 -khtml-user-select: none; 
	   -moz-user-select: none; 
		-ms-user-select: none; 
			user-select: none;
	transition: all 500ms cubic-bezier(0.250, 0.100, 0.250, 1.000); /* ease (default) */
	transition-timing-function: cubic-bezier(0.250, 0.100, 0.250, 1.000); /* ease (default) */
}
.button_hint {
	margin-top: 2px;
	font-size: 13px;
	font-weight: normal;
	color: #666;
	text-transform: none;
	display: none;
}

.button_hint span {
	background: #eee;
	border: 1px solid #aaa;
	padding: 0px 1px;
}
.button:hover {
	background: #eee;
}
.button:active {
	box-shadow: 0px 0px 0px #000;
	margin-right: -2px;
	margin-bottom: -2px;
}
.quote_hint {
	font-size: 13px;
	font-weight: normal;
	color: #444;
	float: right;
	text-transform: none;
	width: 70px;
	text-align: center;
	position: absolute;
	right: 10px;
	top: 10px;
	display: none;
}
.quote_hint img {
	opacity: 0.6;
	width: 70px;
	text-align: center;
	margin: 0 auto;
}
@media screen and (min-width: 620px) {
	.button_hint, .quote_hint {
		display: block;
	}
}
/* Scene words */

.introWords {
	font-family: "Tiempos Text Web",serif !important;
	position: absolute;
	bottom: 45%;
	transform: translate(-50%, -50%);
	color: white;
	text-shadow: -3px -3px 1px rgba(20,20,20, 0.1), -3px -2px 1px rgba(20,20,20, 0.1), -3px -1px 1px rgba(20,20,20, 0.1), -3px 0px 1px rgba(20,20,20, 0.1), -3px 1px 1px rgba(20,20,20, 0.1), -3px 2px 1px rgba(20,20,20, 0.1), -3px 3px 1px rgba(20,20,20, 0.1), -2px -3px 1px rgba(20,20,20, 0.1), -2px -2px 1px rgba(20,20,20, 0.1), -2px -1px 1px rgba(20,20,20, 0.1), -2px 0px 1px rgba(20,20,20, 0.1), -2px 1px 1px rgba(20,20,20, 0.1), -2px 2px 1px rgba(20,20,20, 0.1), -2px 3px 1px rgba(20,20,20, 0.1), -1px -3px 1px rgba(20,20,20, 0.1), -1px -2px 1px rgba(20,20,20, 0.1), -1px -1px 1px rgba(20,20,20, 0.1), -1px 0px 1px rgba(20,20,20, 0.1), -1px 1px 1px rgba(20,20,20, 0.1), -1px 2px 1px rgba(20,20,20, 0.1), -1px 3px 1px rgba(20,20,20, 0.1), 0px -3px 1px rgba(20,20,20, 0.1), 0px -2px 1px rgba(20,20,20, 0.1), 0px -1px 1px rgba(20,20,20, 0.1), 0px 1px 1px rgba(20,20,20, 0.1), 0px 2px 1px rgba(20,20,20, 0.1), 0px 3px 1px rgba(20,20,20, 0.1), 1px -3px 1px rgba(20,20,20, 0.1), 1px -2px 1px rgba(20,20,20, 0.1), 1px -1px 1px rgba(20,20,20, 0.1), 1px 0px 1px rgba(20,20,20, 0.1), 1px 1px 1px rgba(20,20,20, 0.1), 1px 2px 1px rgba(20,20,20, 0.1), 1px 3px 1px rgba(20,20,20, 0.1), 2px -3px 1px rgba(20,20,20, 0.1), 2px -2px 1px rgba(20,20,20, 0.1), 2px -1px 1px rgba(20,20,20, 0.1), 2px 0px 1px rgba(20,20,20, 0.1), 2px 1px 1px rgba(20,20,20, 0.1), 2px 2px 1px rgba(20,20,20, 0.1), 2px 3px 1px rgba(20,20,20, 0.1), 3px -3px 1px rgba(20,20,20, 0.1), 3px -2px 1px rgba(20,20,20, 0.1), 3px -1px 1px rgba(20,20,20, 0.1), 3px 0px 1px rgba(20,20,20, 0.1), 3px 1px 1px rgba(20,20,20, 0.1), 3px 2px 1px rgba(20,20,20, 0.1), 3px 3px 1px rgba(20,20,20, 0.1);
	/* background: black; */
	padding: 10px;
	font-size: 22px;
	line-height: 29px;
	width: 50%;
	left: 50%;
	pointer-events: none;
	user-select: none;
}
.insideIntroWords {
	position: absolute;
	bottom: 0px;
	left: 0px;
	padding: 0 10px;
	transition: max-height 500ms;
	overflow-y: hidden;
	overflow-x: visible;
}
.introWords div { font-weight: normal !important; }
.introWords strong {
	font-size: 40px;
	text-align: center;
}
.introWords span {
	opacity: 0.4;
	display: block;
	margin-top: 10px;
}
.introWords p {
	margin: 0 0 20px 0;
	height: auto;
	transition: all 200ms cubic-bezier(0.250, 0.250, 0.750, 0.750);
	transition-timing-function: cubic-bezier(0.250, 0.250, 0.750, 0.750);
}
.introExit {
	opacity: 0.4;
	font-size: 0.8em;
}
@media screen and (max-width: 620px) {
	.introWords {
		padding: 10px;
		width: 80%;
		left: 50%;
		font-size: 18px;
		line-height: 24px;
	}
}
.visualContainer, .sceneInside {
	overflow: hidden;
}
.visualContainer > div:first-child {
	overflow: hidden;
}
```
  </file>
  <file path="samples/general/grandmas-kimchi-kitchen/mini/pages/mini-scrollbars.css">
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
  <omitted path="build/assets/index-587706de.js">Local runtime build; readable active chapter sources and dialogue, original artwork, p5 and audio dependencies are shipped with the sample.</omitted>
  <omitted path="build/assets/index-69b968e7.css">Local runtime build; readable active chapter sources and dialogue, original artwork, p5 and audio dependencies are shipped with the sample.</omitted>
</sample>
