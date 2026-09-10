<script>
	import P5 from 'p5-svelte';
	import { slide, fade, fly } from 'svelte/transition';
	import Typewriter from 'svelte-typewriter';
	import { onMount } from 'svelte';
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
		fullheight = insideWords.scrollHeight;
		blankScreen = 0;
	});
	
	function onKeyDown(e) {
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
		setTimeout(function() {
			try {
				fullheight = insideWords.scrollHeight;
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
		p.setup = () => {
			p.createCanvas(w, h);
			p.background(0);
			p.noStroke();
			if (chapter < 12) {
				img = p.loadImage(`assets/kimchi/kimchibg.png`);
			} else {
				img = p.loadImage(`assets/kimchi/kimchibg-2.png`);
			}
			
			p.frameRate(20);
		};
	
		p.draw = () => {
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
<svelte:window bind:innerWidth={w} on:keydown|preventDefault={onKeyDown}/>
<div class="sceneInside cutscene"  on:click={next} on:keyup={next}>
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
