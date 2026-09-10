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
