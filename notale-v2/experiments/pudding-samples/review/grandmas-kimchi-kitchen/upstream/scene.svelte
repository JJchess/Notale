<script>
	import Typewriter from 'svelte-typewriter';
	import { fade } from 'svelte/transition';
	import { onMount } from 'svelte';
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
			hed = e.target.getAttribute("hed");
			words = e.target.getAttribute("words");
			type = e.target.getAttribute("type");
			image = "scene" + chapter + "/" + e.target.getAttribute("image");
			alt = e.target.getAttribute("alt");
			selectedHint = Number(e.target.getAttribute("num"));
			
			if (hoverHints[selectedHint].clickable && hoverHints[selectedHint].clicked == "false") {
				eventClicked = 2;
			} else if (hoverHints[selectedHint].clickable == false) {
				eventClicked = 1;
			}
			
			hoverHints[selectedHint].clicked = true;
			
			if (type == "bigImage") {
				scrolledY = false;
				modalShown = true;
			}
			
			/// then in 4 seconds, show the picture again
			setTimeout(function() {
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
			modalShown = false;
			selectedHint = null;
			checkAllClicked();
		}
	}
	
	let keyboardSelected = -1;
	function onKeyDown(e) {
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
		setTimeout(function() {
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
<svelte:window on:keydown|preventDefault={onKeyDown}/>
	<div class="sceneInside {sceneOffset}" style="display:{displayMode}" on:click={getPosition} on:keydown={getPosition} in:fade>
		<img class="sceneImage" alt="scene of grandma making kimchi" src="assets/kimchi/scene{chapter}/background.png" on:click={closeModal} on:keydown={closeModal} draggable="false"/>
		
		{#each hoverHints as hint}
			<!-- {#if (hint.clickable == true && hint.clicked == "false") || (hint.clickable == false) || (hint.keeponpage == "true")} -->
				<button class="hintContainer keyboardSelect{hint.keyboardSelect} {hint.addclass} touch{hint.notouch} clickable-{hint.clickable}-{hint.clicked}" class:selected="{selectedHint === hint.num}" style="width:{hint.width/fullWidth}%; left:{hint.x}%; top:{hint.y}%; pointer-events: {hint.notouch};" on:click={showModal} on:keydown={showModal} hed={hint.hed} words={hint.words} type={hint.type} num={hint.num} image={hint.image} clickable={hint.clickable}>
				
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
								<button class="button bounce2" on:click={nextChapter} on:keydown={nextChapter} style="left:{scrollAmount}px;">Eat kimchi<div class="button_hint">Click or press enter</div></button>
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
		<div class="modal {type}" transition:fade="{{duration: 200}}" on:click={closeModal} on:keydown={closeModal}>
			{#if type == "bigImage"}
				<object class="mobileImage" aria-label="{alt}" type="image/svg+xml" data="assets/kimchi/mobile/{image.replace('.png','.svg')}" on:click={closeModal} on:keydown={closeModal}>
					<img class="mobileImage" alt="{alt}" src="assets/kimchi/mobile/{image.replace('.png','.svg')}" draggable="false"/>
				</object>
				
				<object class="desktopImage" aria-label="{alt}" type="image/svg+xml" data="assets/kimchi/desktop/{image.replace('.png','.svg')}" on:click={closeModal} on:keydown={closeModal}>
					<img class="desktopImage" alt="{alt}" src="assets/kimchi/desktop/{image.replace('.png','.svg')}" draggable="false"/>
				</object>

				<!-- <img class="mobileImage" alt="{alt}" src="assets/kimchi/mobile/{image.replace('.png','.svg')}" draggable="false"/>
				<img class="desktopImage" alt="{alt}" src="assets/kimchi/desktop/{image.replace('.png','.svg')}" draggable="false"/> -->
			{/if}
			<div class="closeModal">Tap to exit</div>
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
		color: white;
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
