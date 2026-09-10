<sample id="coin-flip-wealth" category="general" variant="full">
  <file path="samples/general/coin-flip-wealth/pages/index.html">
```html
<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fair flips, different fortunes</title><script type="module" crossorigin src="./build/assets/index-17d0df38.js"></script>
<link rel="stylesheet" href="./build/assets/index-e910cf40.css">

<body><div id="app"></div></body></html>
```
  </file>
  <file path="samples/general/coin-flip-wealth/pages/main.js">
```javascript
import App from './src/App.svelte';new App({target:document.querySelector('#app')});
```
  </file>
  <file path="samples/general/coin-flip-wealth/pages/src/App.svelte">
```svelte
<script>
import {onMount,tick} from 'svelte';import Simulation from './Simulation.svelte';let run=0,sim,snapshot,history=false;
onMount(()=>{window.coinLab={getState:()=>sim.getState()};document.body.dataset.ready='true'});
async function replay(){run++;history=false;await tick();snapshot=sim.getState()}
function update(){snapshot=sim.getState()}
function openHistory(){history=!history;update()}
const money=v=>v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
</script>
<header><a href="../../../../../index.html" target="_top">← Samples</a><span>Alvin Chang / The Pudding · January 2023</span></header>
<main><p class="eyebrow">THE YARD-SALE MODEL</p><h1>Fair flips,<br>different fortunes.</h1><p class="lead">Start with $100 against an opponent with $1,000. Each flip transfers 20% of the poorer player’s current balance. Follow the two players as their fortunes change.</p><div class="example"><p>The first 12 flips replay the original guided example. After that, flips are random. Restart below for a random experiment from the beginning.</p><button class="replay" on:click={replay}>Replay guided example</button></div>
{#key run}<Simulation bind:this={sim} on:round={update}/>{/key}
<p class="chart-note">Each chart has its own changing dollar scale. Compare the labelled balances, not the apparent steepness of the lines.</p>
<div class="explanation"><h2>Winning half can still leave you with less.</h2><p>In the opening example, you win $20, then lose $24. Your record is 1–1, but your balance is $96. The next wager depends on the poorer player’s balance, so a win and a loss don’t cancel each other out.</p><p>This is a model with virtual balances, no new money and no debt. Each round moves the same amount between players, preserving the total $1,100. In a random run, any particular sequence can turn out differently.</p></div>
<button class="ledger-button" aria-expanded={history} on:click={openHistory}>{history?'Hide':'Show'} exact round history</button>
{#if history && snapshot}<div class="ledger"><table><caption>Balances after each round · dollars rounded to cents for display</caption><thead><tr><th>Round</th><th>You</th><th>Opponent</th><th>Total</th></tr></thead><tbody>{#each snapshot.players.p1.data as d,i}<tr><th>{d.x}</th><td>{money(d.y)}</td><td>{money(snapshot.players.p2.data[i].y)}</td><td>{money(d.y+snapshot.players.p2.data[i].y)}</td></tr>{/each}</tbody></table></div>{/if}
</main><footer><a href="https://pudding.cool/2022/12/yard-sale/" target="_blank" rel="noopener">Original story</a> · <a href="SAMPLE.md">Review notes</a><p>Original hand-drawn portraits, Svelte simulation and charts. Approved local sample.</p></footer>
```
  </file>
  <file path="samples/general/coin-flip-wealth/pages/src/Simulation.svelte">
```svelte
<script>
	import { createEventDispatcher } from "svelte";
 const dispatch = createEventDispatcher();
 export let randomStart = false;
 let randomMode = randomStart;
 export function getState(){return {round,players,wagerData,randomMode};}

 import { fade } from 'svelte/transition';
	import { range } from "d3";
	import { LayerCake, Svg } from "layercake";
	import Line from "$components/charts/Line.svelte";
	import AxisX from "$components/charts/AxisX.svg.svelte";
	import AxisY from "$components/charts/AxisY.svg.svelte";

	let winningPlayer = "p1";
	let round = 0;
	let roundMax = 10;
	let players = {
		"p1": {
			"wins": 0,
			"rate": 0,
			"wealth": 100,
			"minmax": [70,130],
			"mood": "sad",
			"data": [{
				x: 0,
				y: 100
			}]
		},
		"p2": {
			"wins": 0,
			"rate": 0,
			"wealth": 1000,
			"minmax": [700,1300],
			"mood": "sad",
			"data": [{
				x: 0,
				y: 1000
			}]
		}
	}

	const x = "x";
	const y = "y";
	const p = 30;
	const padding = {
		top: p,
		left: 50,
		bottom: p,
		right: p
	};
	const formatTickY = d => "$"+d;
	let wagerData = getWager();


	let playerWinOrder = ["p1","p2","p1","p2","p1","p1","p2","p2","p2","p1","p1","p1","p2","p2"];
	// Playing one round of the a coin flip.
	// Triggered on "Win" button click
	function playRound(event) {
		// Setting the latest winner
		// let player = event.target.getAttribute("player");
		let gamesPlayed = players.p1.data.length;
		if (!randomMode && gamesPlayed < playerWinOrder.length - 1) {
			winningPlayer = playerWinOrder[gamesPlayed-1];
		} else {
			winningPlayer = playerWinOrder[Math.round(Math.random()*(playerWinOrder.length-1) )];
		}
		players.p1.latest = winningPlayer == "p1" ? "win" : "lost";
		players.p2.latest = winningPlayer == "p2" ? "win" : "lost"; 
		
		// Calculating wager
		wagerData = getWager();

		let wager = wagerData[0];
		
		// Updating player info based on who won
		
		players[winningPlayer].wins += 1;
		round += 1;
		players.p1.rate = Math.round(players.p1.wins / round * 100);
		players.p2.rate = Math.round(players.p2.wins / round * 100);
		players.p1.mood = players.p1.rate >= 51 ? "happy" : "sad";
		players.p2.mood = players.p2.rate >= 50 ? "happy" : "sad"; 
		if (winningPlayer == "p1") {
			players.p1.data.push({"x": round, "y": players.p1.wealth += wager});
			players.p2.data.push({"x": round, "y": players.p2.wealth -= wager});
		} else {
			players.p1.data.push({"x": round, "y": players.p1.wealth -= wager});
			players.p2.data.push({"x": round, "y": players.p2.wealth += wager});
		}

		// Updating chart settings
		if (players.p1.wealth > players.p1.minmax[1]) {
			players.p1.minmax[1] = players.p1.wealth * 1.1;
		}
		if (players.p1.wealth < players.p1.minmax[0]) {
			players.p1.minmax[0] = players.p1.wealth * 0.9;
		}
		if (players.p2.wealth > players.p2.minmax[1]) {
			players.p2.minmax[1] = players.p2.wealth * 1.1;
		}
		if (players.p2.wealth < players.p2.minmax[0]) {
			players.p2.minmax[0] = players.p2.wealth * 0.9;
		}

		if (round > 9) {
			roundMax = null;
		}

		// Getting new wager data for interface
		wagerData = getWager();
 dispatch("round");
	}

	function reset() {
		randomMode = true;
 playerWinOrder = ["p1","p2"];
		round = 0;
		roundMax = 10;
		players = {
			"p1": {
				"wins": 0,
				"rate": 0,
				"wealth": 100,
				"minmax": [70,120],
				"mood": "happy",
				"data": [{
					x: 0,
					y: 100
				}]
			},
			"p2": {
				"wins": 0,
				"rate": 0,
				"wealth": 1000,
				"minmax": [900,1100],
				"mood": "happy",
				"data": [{
					x: 0,
					y: 1000
				}]
			}
		}
		wagerData = [20,"Player 1"];
 dispatch("round");
	}

	function getWager() {
		let w = players.p1.data[round].y * 0.2;
		let poorerPlayer = "You (poorer player)"; 
		if (players.p1.data[round].y > players.p2.data[round].y) {
			w = players.p2.data[round].y * 0.2;
			poorerPlayer = "Richer player";
		}
		return [w, poorerPlayer];
	}

	function comma(x) {
		return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	}

	function formatMoney(d, plusminus) {
		if (d >= 0) {
			if (plusminus && d > 0) {
				return "+$" + comma(Math.round(d));
			}
			return "$" + comma(Math.round(d));
		}
		return "-$" + comma((Math.abs(Math.round(d))));
	}
</script>
<div class="interactive_container">
	<div class="ysm_container">
		<p class="mode-label">{randomMode || round >= 12 ? "Random coin flips" : `Guided example · ${round} of 12 flips`}</p>
 <!-- Top text -->
		<div class="fullInfo">
			<div class="wager_amount">
				Flip a coin to see who wins <strong>{formatMoney(wagerData[0])}</strong>
			<!-- 	<div class="fullInfoSub">(20% of {wagerData[1]}'s wealth)</div> -->
			</div>
			{#if players.p1.data.length == 1}
				<button class="flipButton button" player="" on:click={playRound}>Flip coin</button>
			{:else}
				<button class="flipButton button" player="" on:click={playRound}>Flip coin</button>
			{/if}
		</div>
		<!-- TWO CHARTS -->
		<div class="chart_container extrawide">

			<!-- PLAYER 1 CONTAINER -->
			<section>
				<figure>
					<div class="profile profile1">
						<div class="headshot bg-{players.p1.mood}" style="background-image:url(assets/yardsale/art/player1-{players.p1.mood}.png)">
							{#if players.p1.wins == 0 && players.p2.wins == 0}
							<div class="speechBubble player1bubble" in:fade={{ delay: 0 }} out:fade>Flip the coin.</div>
							{/if}
							{#if players.p1.wins == 1 && players.p2.wins == 0}
							<div class="speechBubble player1bubble" in:fade={{ delay: 0 }} out:fade>I won! Now I can wager more.</div>
							{/if}
							{#if players.p1.wins == 0 && players.p2.wins == 1}
							<div class="speechBubble player1bubble" in:fade={{ delay: 0 }} out:fade>Now my turn to win!</div>
							{/if}
							{#if players.p1.rate < 45 && players.p1.latest == "lost" && players.p2.wins > 2 && round < 20}
							<div class="speechBubble player1bubble" in:fade={{ delay: 0 }} out:fade>Let me win half the time!</div>
							{/if}
							{#if players.p1.wins == 1 && players.p2.wins ==1}
							<div class="speechBubble player1bubble" in:fade={{ delay: 0 }} out:fade>I'm 1-1, but I lost money?</div>
							{/if}
							{#if players.p1.rate == 50 && players.p1.wins > 1 && players.p1.wealth < players.p2.wealth && round < 20}
							<div class="speechBubble player1bubble" in:fade={{ delay: 0 }} out:fade>I've won 50%, but I lost money!?</div>
							{/if}
							{#if players.p1.rate == 50 && players.p1.wins >= 5 && players.p1.wins < 3 && players.p1.wealth < players.p2.wealth}
							<div class="speechBubble player1bubble" in:fade={{ delay: 0 }} out:fade>When I lose, I have less to wager!</div>
							{/if}
						</div>
						<div class="playerName">
							<strong>{players.p1.wealth <= players.p2.wealth ? "You (poorer player)" : "You (now richer)"}</strong>
							<br>{ formatMoney(players.p1.wealth) }
							<br>{players.p1.wins}-{round-players.p1.wins} ({players.p1.rate}%)
						</div>

						<!-- Winner buttons -->
						<!-- {#if players.p1.data.length > 3}
						<div class="winButton button winp1" player="p1" on:click={playRound}>Win</div>
						{/if} -->
						{#if winningPlayer == "p2" && round > 0}
						<div class="winWords">Lose</div>
						{:else if winningPlayer == "p1" && round > 0}
						<div class="winWords happyWords">Win</div>
						{/if}
					</div>
					<LayerCake 
					data={players.p1.data}
					{x}
					{y}
					{padding}
					xDomain={ [0, roundMax] } 
					yDomain={ [players.p1.minmax[0], players.p1.minmax[1]] } 
					>
					<Svg>
						<AxisY formatTick={formatTickY} baseTick=100 />
						<AxisX />
						<Line 
						strokeWidth="5"
						stroke="#420070"
						/>
					</Svg>
					</LayerCake>
				</figure>
			</section>

			<!-- PLAYER 2 CONTAINER -->
			<section>
				<figure>
					<div class="profile profile2">
						<div class="headshot bg-{players.p2.mood}" style="background-image:url(assets/yardsale/art/player4-{players.p2.mood}.png)">
							
							{#if players.p2.rate < 45 && players.p2.latest == "lost" && players.p1.wins > 2 &&  players.p1.wins < 8}
							<div class="speechBubble player1bubble" in:fade={{ delay: 0 }} out:fade>This is unfair.</div>
							{/if}
						</div>
						<div class="playerName"><strong>{players.p2.wealth >= players.p1.wealth ? "Richer player" : "Opponent (now poorer)"}</strong>
							<br>{ formatMoney(players.p2.wealth) }
							<br>{players.p2.wins}-{round-players.p2.wins} ({players.p2.rate}%)
						</div>
						<!-- {#if players.p1.data.length > 3}
						<div class="winButton button winp2" player="p2" on:click={playRound}>Win</div>
						{/if} -->
						{#if winningPlayer == "p1" && round > 0}
						<div class="winWords">Lose</div>
						{:else if winningPlayer == "p2" && round > 0}
						<div class="winWords happyWords">Win</div>
						{/if}
					</div>
					<LayerCake
					data={players.p2.data}
					{x}
					{y}
					{padding}
					xDomain={ [0, roundMax] } 
					yDomain={ [players.p2.minmax[0], players.p2.minmax[1]] } 
					>
					<Svg>
						<AxisY formatTick={formatTickY} baseTick=1000 />
						<AxisX />
						<Line 
						strokeWidth="5"
						stroke="#420070"
						/>
					</Svg>
					</LayerCake>
				</figure>
			</section>
		</div>
		<p class="round-readout" role="status" aria-live="polite">Round {round} · Total wealth {formatMoney(players.p1.wealth + players.p2.wealth)}</p>
 <div class="resetContainer extrawide">
			<button class="reset" on:click={reset}>Restart with random flips</button>
		</div>
	</div>
</div>
<style>
	figure {
		margin: 1rem auto;
		width: 100%;
		height: 50vh;
		position: relative;
	}
	.chart_container, .resetContainer {
		display: flex;
		position: relative;
	}
	.ysm_container  {
		width: 100%;
		max-width:700px;
		margin: 0px auto;
		padding: 0 10px;
		color:  var(--category-bg-purple);
		-webkit-touch-callout: none;
		-webkit-user-select: none; 
		-khtml-user-select: none; 
		-moz-user-select: none; 
		-ms-user-select: none; 
		user-select: none; 
	}
	
	.ysm_container section {
		flex: 2;
	}
	.ysm_container section figure {
		background: #fff; 
		padding: 60px 5px 5px;
		border: 1px solid var(--category-purple2);
	}
	.ysm_container section:nth-child(1) {
		margin-right:  5px;
	}
	.ysm_container section:nth-child(2) {
		margin-left:  5px;
	}
	@media only screen and (max-width: 550px) {
		.chart_container, .resetContainer {
			display: block;
			position: relative;
		}
		.ysm_container section {
			flex: 1;
			margin: 0px !important;
		}
		figure {
			margin: 0.3rem auto;
			width: 100%;
			height: 38vh;
		}
	}

	
	.profile_container {
		display: block;
		width: 100%;
		position: relative;
		height: 50px;
	}
	.profile {
		position: absolute;
		width: 100%;
		top: 10px;
		left: 10px;
	}
	.playerName {
		position: absolute;
		width: calc(100% - 60px);
		top: 0px;
		left: 60px;
		line-height: 1.2em;
	}
	.headshot {
		position: absolute;
		width: 50px;
		height: 60px;
		background-color: #cdcdcd;
		border: 1px solid var(--category-purple2);
		background-size: 120% auto;
		background-repeat: no-repeat;
		background-position: 30% 2px;
	}
	.headshot.bg-happy {
		background-color: #f5cd49;
	}
	@media only screen and (max-width: 550px) {
		.profile {
			margin: 0 !important;
		}
		.fullInfo {
			margin-top: 0;
		}
	}
	.winWords {
		position: absolute;
		right: 20px;
		top: 0px;
		width: 60px;
		font-weight: bold;
		text-transform: uppercase;
		text-align: center;
		color: black;
		background: #ccc;
	}
	.happyWords.winWords {
		background: #f5cd49;
	}
	.winButton {
		position: absolute;
		right: 20px;
		top: 0px;
		width: 60px;
	}
	.flipButton {
		margin: 10px auto;
		width: 160px;
		font-weight: bold;
		font-size:  16px;
	}
	@media only screen and (max-width: 500px) {
		.wager_amount {
			text-align: center;
		}
		.fullInfo {
			text-align: right;
		}
	}
	.speechBubble {
		width: 300%;
		bottom: 110%;
		left: 10%;
	}

</style>
```
  </file>
  <file path="samples/general/coin-flip-wealth/pages/variables.css">
```css
/**
 * Do not edit directly
 * Generated on Tue, 31 May 2022 13:42:06 GMT
 */

:root {
  --speechbg: #fff;
  --category-blue: #4477AA;
  --category-red: #EE6677;
  --category-green: #228833;
  --category-yellow: #CCBB44;
  --category-cyan: #66CCEE;
  --category-purple: #f5dcf2;
  --category-purple2: #9e89ab;
  --category-bg-purple: #420070;
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
  <file path="samples/general/coin-flip-wealth/pages/style.css">
```css
@font-face{font-family:"National 2 Web";src:url(assets/National2Web-Regular.woff2);font-weight:400}@font-face{font-family:"National 2 Web";src:url(assets/National2Web-Bold.woff2);font-weight:700}*{box-sizing:border-box}body{margin:0;overflow-x:visible;font-family:"National 2 Web",sans-serif;color:#420070;font-size:18px;line-height:1.5}a{color:inherit;text-underline-offset:3px}header,footer{max-width:1050px;margin:auto;padding:22px 24px;font-size:13px}header{display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid #cfc3d7}main{max-width:1050px;padding:38px 24px 45px;margin:auto}.eyebrow{font-size:14px;letter-spacing:2px;margin:0 0 10px}h1{font-size:66px;line-height:1.03;letter-spacing:-1.5px;margin:0 0 26px}.lead{max-width:700px;font-size:21px;line-height:1.55;margin:0 0 26px}.example{display:flex;gap:22px;align-items:center;border-top:1px solid #c7b4d1;border-bottom:1px solid #c7b4d1;padding:14px 0;margin-bottom:24px}.example p{font-size:15px;max-width:650px;margin:0}button{font:inherit;cursor:pointer;color:inherit}button.replay,.ledger-button{border:1px solid #9e89ab;background:#f5dcf2;padding:8px 12px;font-size:15px;white-space:nowrap}.mode-label{font-size:14px;text-align:center;color:#715583;margin:0 0 8px}.interactive_container{font-size:18px}.interactive_container .fullInfo{text-align:center;margin-bottom:42px}.interactive_container .round-readout{text-align:center;margin:16px 0 8px;font-size:16px}.interactive_container .resetContainer{justify-content:flex-end}.reset{font-size:14px;font-family:inherit;cursor:pointer}.chart-note{font-size:15px;text-align:center;max-width:700px;margin:22px auto 36px;color:#715583}.explanation{max-width:700px;margin:0 auto 28px}.explanation h2{font-size:27px;line-height:1.2}.explanation p{font-size:18px;line-height:1.6}.ledger-button{display:block;margin:0 auto}.ledger{max-height:450px;overflow:auto;background:#fff;margin:18px auto;max-width:700px}table{border-collapse:collapse;width:100%;font-size:15px;font-variant-numeric:tabular-nums}caption{font-size:13px;text-align:left;padding:14px}td,th{padding:8px 12px;border-bottom:1px solid #e1d5e8;text-align:right}thead{position:sticky;top:0;background:#eee4f5}footer{border-top:1px solid #cfc3d7;color:#715583}footer p{margin:12px 0 0}:focus-visible{outline:3px solid #420070;outline-offset:4px}@media(max-width:700px){header{font-size:11px;padding:18px}header span{text-align:right;max-width:170px}main{padding:28px 18px}h1{font-size:48px}.lead{font-size:18px}.example{display:block}.example p{margin-bottom:12px}.interactive_container{font-size:17px}.explanation h2{font-size:24px}.explanation p{font-size:17px}.interactive_container .ysm_container{padding:0}.interactive_container figure{min-height:280px}.interactive_container .fullInfo{margin-bottom:48px}.chart-note{text-align:left}.interactive_container .resetContainer{text-align:right}.ledger th,.ledger td{padding:8px}.speechBubble{max-width:170px}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
```
  </file>
  <file path="samples/general/coin-flip-wealth/pages/normalize.css">
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
  <file path="samples/general/coin-flip-wealth/pages/reset.css">
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

#body a {
	color: #000;
	text-decoration: none;
	border-bottom: 1px solid #000;
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
  <file path="samples/general/coin-flip-wealth/pages/source.css">
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
body {
	background: #ece6f0;
	overflow-x: hidden;
	width: 100%;
}

/* containers */
#body {
	margin-bottom:110px;
}
.interactive_container {
	width: 100%;
	padding: 10px 0;
	font-family: "National 2 Web";
}
.body_container {
	width: 100%;
	max-width:  640px;
	margin:  0 auto;
	padding: 0px 10px;	
	font-family: "National 2 Web"; 
	font-size: 1.4em;
	line-height: 1.5em;
	box-sizing: border-box;
	color: black;
}
.interactive_container .extrawide {
	width:  140%;
	margin-left: -20%;
}
.interactive_container svg {
	min-width: 100px;
	min-height: 100px;
}
@media only screen and (max-width: 1400px) {
	.interactive_container .extrawide {
		width:  120%;
		margin-left: -10%;
	}
}
@media only screen and (max-width: 1100px) {
	.interactive_container .extrawide {
		width:  100%;
		margin-left: 0%;
	}
}

blockquote {
	padding: 20px 20px 10px;
	background: rgba(50,0,50,0.1);
}

/* text */
.body_container h2 {
	font-size: 2.0rem;
	line-height: 1.1em;
	text-align: left;	
	font-weight:  bold;
	margin-top: 50px;
	margin-bottom:  6px;
}
.body_container p {
	margin-bottom: 25px;
}
.body_container section h3 {
	font-size: 1.7rem;
	line-height: 1.1em;	
	font-weight:  bold;
	margin-bottom:  6px;
	margin-top: 30px;
}
.body_container section .dek {
	font-size:  17px;
	font-style:  italic;
	margin-top:  0px;
}

/* buttons */
.interactive_container .button {
	font-family: "National 2 Web"; 
	text-align: center;
	cursor: pointer;
	margin:  0 0px !important;
	padding:  5px;
	font-weight: bold;
	font-size:  1em;
	/* text-transform: uppercase; */
	border:  2px solid var(--category-bg-purple);
	background: var(--category-purple);
	line-height: 1.1em;
	box-shadow: 2px 2px 0px 0px  var(--category-bg-purple);
	color:  var(--category-bg-purple);
	touch-action: manipulation
}

.interactive_container .button:hover {
	background:#ebcde7
}
.interactive_container .button:active{
	transform: translateX(2px) translateY(2px);
	box-shadow: 0px 0px 0px 0px #000;
}
.interactive_container .button.bounce {
	animation: bounce 1s ease infinite;
}

/* Interactives */
.ysm_data {
	font-size: 15px;
	line-height: 1.3em;
	color: var(--category-bg-purple);
	font-family: "National 2 Web"; 
}

.fullInfo { 
	position: relative;
	width: 100%;
	text-align: center;
	line-height: 1.2em;
	font-size: 1.5em;
	margin: 0px 0 30px;
}

.wager_amount {
	margin-bottom: 10px;
}
@media only screen and (min-width: 500px) {
	.fullInfo { 
		margin: 30px 0 30px;
	}
}
.fullInfoSub {
	font-size: 15px;
	max-width: 350px;
	margin: 0 auto;
	line-height: 1.4em;
	color: var(--category-bg-purple);
}
rect.player {
	fill:  #9e9ac8;
	opacity: 1;
}
rect.player.player0, rect.player.player99  {
	fill: var(--category-bg-purple) !important;
}
rect.faded, rect.faded.player.player0, rect.faded.player.player99 {
	fill:#f5cd49 !important;
	opacity: 0.7;
}
.purple {
	background: #b0abe6;
	padding: 0 2px;
	border-radius: 2px;
}
.yellow {
	background: #f5cd49;
	padding: 0 2px;
	border-radius: 2px;
}
svg line {
	stroke-dasharray: 4px 4px;
	stroke: rgba(0,0,0,0.2);
	transition: all 100ms cubic-bezier(0.250, 0.100, 0.250, 1.000);
	transition-timing-function: cubic-bezier(0.250, 0.100, 0.250, 1.000);
}
svg text {
	fill: #000;
	transition: all 100ms cubic-bezier(0.250, 0.100, 0.250, 1.000);
	transition-timing-function: cubic-bezier(0.250, 0.100, 0.250, 1.000);
}
.player1Text, .player2Text {
	fill: var(--category-bg-purple);
	font-weight: 800;
	font-size: 14px;
	paint-order: stroke;
	fill-opacity:1;stroke:#fff;stroke-width:2px;stroke-linecap:butt;stroke-linejoin:miter;stroke-opacity:1;
}
.player2Text {
	text-anchor: end;
}
.player2Text.red {
	fill: #d0a002 !important;
}
.chartText {
	fill: #555;
	font-size: 0.725em;
	font-weight: 200;
}
.roundItem {
	position: absolute;
	right: 20px;
	bottom: 0px;
	color: black;
}

.resetContainer {
	width: 100%;
	height: 50px;
	position: relative;
}
.reset {
	position: absolute;
	right: 5px;
	top:  0px;
	background: var(--category-purple);
	color:  var(--category-purple2);
	border: 2px solid var(--category-purple2);
	padding:  5px;
	cursor: pointer;
	text-transform: uppercase;
	font-weight: bold;
	-webkit-touch-callout: none;
	-webkit-user-select: none; 
	-khtml-user-select: none; 
	-moz-user-select: none; 
	-ms-user-select: none; 
	user-select: none;
	box-shadow: none !important;
	opacity: 0.8;
}
.reset:hover {
	background:#ebcde7;
	opacity: 1;
}
.reset:active {
	color:  black;
}

/* Speech bubbles */
.speechBubble {
	position: absolute;
	max-width: 200px;
	z-index: 99;
	background: var(--speechbg);
	background: white;
	color: var(--category-bg-purple) !important;
	padding: 5px;
	font-size: 12px;
	line-height: 1.2em;
	text-align:left;
	font-family: "National 2 Web", sans-serif;
	box-shadow: 10px 6px 41px 0px rgba(0,0,0,0.3);
	-webkit-box-shadow: 10px 6px 41px 0px rgba(0,0,0,0.3);
	-moz-box-shadow: 10px 6px 41px 0px rgba(0,0,0,0.3);
}

@media only screen and (min-width: 420px) {
	.speechBubble {
		font-size: 14px;
		padding: 6px;
		max-width: 200px;
	}
}
@media only screen and (min-width: 740px) {
	.speechBubble {
		font-size: 16px;
		line-height: 1.3em;
		max-width: 230px;
	}
}

.speechBubble.player1bubble {
	left: 22%;
	bottom: 65%;
}
.speechBubble.player1bubble:before {
	content: "";
	width: 0;
	height: 0;
	border-left: 2px solid transparent;
	border-right: 10px solid transparent;
	border-top: 15px solid  var(--speechbg);
	position: absolute;
	top: 100%;
	left: 10px;
}
.speechBubble.player2bubble {
	right: 30%;
	top: 55%;
}
.speechBubble.player2bubble:before {
	content: "";
	width: 0;
	height: 0;
	border-left: 10px solid transparent;
	border-right: 2px solid transparent;
	border-bottom: 15px solid var(--speechbg);
	position: absolute;
	bottom: 100%;
	right: 10px;
}
.watch_bottom {
	max-width: 100%;
	width: 640px;
	margin: 70px auto -40px;
}

/* Animation */

@keyframes bounce {
	0%, 20%, 50%, 80%, 100% {transform: translateY(0);}
	40% {transform: translateY(-10px);}
	60% {transform: translateY(-3px);}
}
```
  </file>
  <file path="samples/general/coin-flip-wealth/pages/font.css">
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
```
  </file>
  <omitted path="build/assets/index-17d0df38.js">Locally shipped runtime build or library dependency; readable author components and styles are included in this bundle.</omitted>
  <omitted path="build/assets/index-e910cf40.css">Locally shipped runtime build or library dependency; readable author components and styles are included in this bundle.</omitted>
</sample>
