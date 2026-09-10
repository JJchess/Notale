<sample id="crokinole-shot-lab" category="general" variant="full">
  <file path="samples/general/crokinole-shot-lab/pages/index.html">
```html
<!doctype html><html lang="zh-CN">
<script type="module" crossorigin src="./build/assets/index.dev-F0dTH2W0.js"></script>
<link rel="stylesheet" crossorigin href="./build/assets/index-s_V-KdBH.css">
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Crokinole · 一击训练室</title><div id="app"></div></html>
```
  </file>
  <file path="samples/general/crokinole-shot-lab/pages/src/App.svelte">
```svelte
<script>
import {onMount,onDestroy} from 'svelte';import C from './utils/crokinole.js';import Bg from './components/Crokinole.Bg.svelte';import scenarios from './data/scenarios.json';import * as S from './data/specs.js';import {muted} from './stores/misc.js';
let host,stage,sim,width=500,ready=false,challenge='opentry',phase='position',position=387,angle=0,power=.3,holding=false,interval,result=null,attempts=0;const challenges=[{id:'opentry',title:'01 · 直取中心',text:'没有对方棋子时，射出的棋子必须进入或接触 15 分区。试着把它送进 20 分洞。'},{id:'opponenttry',title:'02 · 碰到对手',text:'青色棋子还在棋盘上，你的这一击必须碰到对方棋子，直接碰撞或经另一枚棋子传递均可。'},{id:'ricochettry',title:'03 · 借力入洞',text:'先碰到青色棋子，再借反弹冲击中心。瞄准与力度需要一起调整。'}];
function reset(id=challenge){stopHold(false);challenge=id;phase='position';position=387;angle=0;power=.3;result=null;if(sim&&ready){sim.removeDiscs();scenarios[id].forEach(d=>sim.addDisc({...d}));sim.positionDisc(position)}debug()}
function debug(){window.crokinoleLab={ready,phase,challenge,attempts,power,result,discs:sim?.snapshot()||[]}}
function place(){if(phase!=='position')return;phase='aim';sim.setState('shoot');aim()}
function aim(){if(phase==='aim'){sim.aimDisc({degrees:angle,power,visible:true,random:false});debug()}}
function shoot(){if(phase!=='aim')return;aim();phase='rolling';attempts+=1;sim.flickDisc();debug()}
function startHold(e){if(phase!=='aim'||holding)return;if(e.type==='keydown'&&![' ','Enter'].includes(e.key))return;e.preventDefault();holding=true;power=0;let dir=1;interval=setInterval(()=>{if(power>=1)dir=-1;if(power<=0)dir=1;power=+(power+.01*dir).toFixed(2);aim()},17);if(e.pointerId!==undefined)e.currentTarget.setPointerCapture(e.pointerId)}
function stopHold(fire=true){if(!holding)return;clearInterval(interval);holding=false;if(fire)shoot()}
function keyup(e){if([' ','Enter'].includes(e.key)){e.preventDefault();stopHold()}}
function complete({discs,valid}){if(phase!=='rolling')return;const records=discs.map(d=>({player:d.player,score:d.score,valid:d.valid,x:d.position.x,y:d.position.y}));const score=records.filter(d=>d.player==='player1').reduce((a,d)=>a+d.score,0);result={valid,score,records,twenty:records.some(d=>d.player==='player1'&&d.score===20)};phase='done';debug()}
onMount(()=>{sim=C();sim.autoMute(false);sim.setDifficulty('easy');sim.on('shotCompleteManual',complete);sim.on('ready',()=>{ready=true;reset()});const measure=()=>{width=Math.min(stage.clientWidth,innerWidth<760?500:Math.max(360,innerHeight-160),620);if(ready)sim.resize(width)};measure();sim.init({element:host,width,tutorial:'practice'});const ro=new ResizeObserver(measure);ro.observe(stage);return()=>{ro.disconnect();stopHold(false);sim.destroy()}});onDestroy(()=>clearInterval(interval));
</script>
<svelte:window on:blur={()=>stopHold(false)} />
<header><a href="../../../../../index.html" target="_top">← Samples</a><span>THE PUDDING / SOURCE STUDY 09</span><button on:click={()=>muted.update(v=>!v)} aria-pressed={!$muted}>{$muted?'音效关闭':'音效开启'}</button></header>
<main><aside><span class="eyebrow">CROKINOLE / SHOT LAB</span><h1>只差一击。</h1><p class="lead">摆好位置，瞄准，控制力度。<br>在同一块棋盘上练习三种出手。</p><nav aria-label="选择训练局面">{#each challenges as c}<button aria-pressed={challenge===c.id} on:click={()=>reset(c.id)} disabled={phase==='rolling'}>{c.title}</button>{/each}</nav><p class="rule">{challenges.find(c=>c.id===challenge).text}</p><div class="controls"><label>起手位置 <output>{Math.round((position-387)/387*100)}%</output><input aria-label="起手位置" type="range" min={.21*S.boardR*2} max={.79*S.boardR*2} step="0.01" bind:value={position} disabled={phase!=='position'} on:input={e=>{position=+e.currentTarget.value;sim.positionDisc(position);debug()}}></label><label>瞄准角度 <output>{angle.toFixed(2)}°</output><input aria-label="瞄准角度" type="range" min="-90" max="90" step=".25" bind:value={angle} disabled={phase!=='aim'} on:input={e=>{angle=+e.currentTarget.value;aim()}}></label><label>力度 <output>{Math.round(power*100)}%</output><input aria-label="力度" type="range" min=".01" max="1" step=".01" bind:value={power} disabled={phase!=='aim'||holding} on:input={e=>{power=+e.currentTarget.value;aim()}}></label></div><div class="actions">{#if phase==='position'}<button class="primary" on:click={place} disabled={!ready}>确认位置 →</button>{:else if phase==='aim'}<button class="primary" on:click={shoot}>按当前力度发射</button><button class="hold" on:pointerdown={startHold} on:pointerup={()=>stopHold()} on:pointercancel={()=>stopHold(false)} on:keydown={startHold} on:keyup={keyup}>按住蓄力，松开发射</button>{:else if phase==='rolling'}<p class="rolling">棋子运动中…</p>{:else}<button class="primary" on:click={()=>reset()}>再试一次 ↻</button>{/if}</div><div class="feedback" role="status" aria-live="polite">{#if result}<strong>{!result.valid?'无效出手':result.twenty?'20 分入洞！':'有效出手'}</strong><p>{result.valid?`粉色棋子当前共 ${result.score} 分。`:'这次没有满足局面要求，射出的棋子已移除。'}</p>{:else}<span>{phase==='position'?'先用滑块选择起手位置。':phase==='aim'?'箭头指向出手方向，长度随力度变化。':'等待棋子停稳后结算。'}</span>{/if}</div><small>这是原作的二维物理模拟。力度百分比是模拟参数。<br>已出手 {attempts} 次 · 粉色是你，青色是对手</small></aside><section class="stage" bind:this={stage} aria-label="弹棋棋盘"><div class="board" style:width="{width}px" style:height="{width}px"><Bg {width} tutorialClass=""/><div class="canvas-host" bind:this={host}></div></div><div class="score-key"><span>中心 <b>20</b></span><span>内圈 <b>15</b></span><span>中圈 <b>10</b></span><span>外圈 <b>5</b></span></div><p class="board-note">压线按较低分区计分；棋盘外为 0 分。<br>落洞、碰桩与碰边音效来自原作。</p></section></main><footer><a href="https://pudding.cool/2024/10/crokinole/" target="_blank" rel="noreferrer">原作 Russell Samora / The Pudding ↗</a><a href="SAMPLE.md">来源与复核记录</a><span>已审阅入库</span></footer>
<style>
:global(*){box-sizing:border-box}:global(body){margin:0;background:#fff;color:#333;font-family:Arial,"Noto Sans SC",sans-serif;--color-ditch:#dfdfdf;--color-rim:#a8a8a8;--color-board:#fff;--color-line:#dfdfdf;--color-peg:#6d6d6d;--color-fg-light:#6d6d6d;--outline-width:2px;--14px:14px}:global(a){color:inherit}:global(button){font:inherit;color:inherit;background:transparent;border:1px solid #bbb;padding:10px 14px;cursor:pointer}:global(button:disabled){opacity:.4;cursor:default}:global(:focus-visible){outline:3px solid #00a3a3;outline-offset:4px}header{display:flex;justify-content:space-between;align-items:center;margin:0 36px;padding:16px 0;border-bottom:1px solid #ddd;font-size:11px;letter-spacing:.05em}header button{font-size:11px;padding:7px 12px}main{display:grid;grid-template-columns:320px minmax(0,1fr);gap:80px;max-width:1220px;margin:auto;padding:32px 36px}.eyebrow{font:10px monospace;letter-spacing:.1em}h1{font-family:Georgia,serif;font-weight:500;font-size:48px;margin:12px 0 16px}.lead{font-size:14px;line-height:1.8;margin-bottom:25px}nav{display:flex;flex-direction:column;gap:7px}nav button{text-align:left;font-size:13px}nav button[aria-pressed=true]{background:#00a3a3;color:white;border-color:#00a3a3}.rule{font-size:12px;line-height:1.8;min-height:65px;margin:18px 0}.controls{border-block:1px solid #ddd;padding:4px 0}label{display:block;font-size:11px;margin:14px 0}output{float:right;font-variant-numeric:tabular-nums}input{display:block;width:100%;accent-color:#333;margin:12px 0}input:disabled{opacity:.35}.actions{display:flex;flex-direction:column;gap:8px;margin-top:18px}.actions button{font-size:13px}.primary{background:#333;color:white;border-color:#333}.hold{touch-action:none;user-select:none}.feedback{min-height:65px;padding-top:17px;font-size:12px;line-height:1.7}.feedback strong{font-size:18px}.feedback p{margin:7px 0}.rolling{font-size:13px}small{font-size:10px;line-height:1.8;color:#888;display:block;margin-top:12px}.stage{min-width:0;align-self:center}.board{position:relative;margin:auto}.canvas-host{position:absolute;inset:0;pointer-events:none}.canvas-host :global(canvas){width:100%!important;height:100%!important;display:block}.score-key{display:flex;justify-content:center;gap:25px;font-size:11px;margin-top:20px}.score-key b{display:block;text-align:center;font:24px Georgia,serif;margin-top:5px}.board-note{text-align:center;font-size:10px;line-height:1.8;color:#888;margin-top:20px}footer{display:flex;justify-content:space-between;gap:20px;border-top:1px solid #ddd;margin:0 36px;padding:17px 0;font-size:10px}@media(max-width:760px){header{margin:0 20px}header span{display:none}main{display:flex;flex-direction:column;padding:24px 20px;gap:25px}aside{display:contents}.eyebrow{order:0}h1{order:0;font-size:36px;margin:-10px 0 0}.lead{order:0;margin:-10px 0 0;font-size:12px}nav{order:0;flex-direction:row;gap:5px}nav button{padding:10px 7px;font-size:10px;flex:1;text-align:center}.rule{order:0;min-height:0;margin:-10px 0;font-size:11px}.stage{order:1;width:100%}.controls{order:2}.actions{order:3;margin:0}.feedback{order:4;padding:0;min-height:0}small{order:5;margin:0}.score-key{margin-top:15px}.board-note{display:none}footer{flex-wrap:wrap;margin:0 20px;font-size:9px}.controls label{margin:12px 0}}@media(prefers-reduced-motion:reduce){:global(*){transition:none!important}}
</style>
```
  </file>
  <file path="samples/general/crokinole-shot-lab/pages/src/components/Crokinole.Bg.svelte">
```svelte
<script>
	import * as S from "$data/specs.js";

	export let width;
	export let tutorialClass;

	const angles = [45, 135, 225, 315];
	const pegs = [15, 60, 105, 150, 195, 240, 285, 330];
	const regions = ["five", "ten", "fifteen", "twenty"];
	const regionText = {
		five: "5",
		ten: "10",
		fifteen: "15",
		twenty: "20"
	};
</script>

<div
	class="bg {tutorialClass}"
	style:width="{width}px"
	style:height="{width}px"
>
	<div
		class="base"
		style="--w: {((S.baseR - S.rimW) / S.boardR) * width}px; --b: {(S.rimW /
			S.boardR) *
			width}px;"
	></div>

	<div class="surface" style="--w: {(S.surfaceR / S.boardR) * width}px;"></div>

	{#each regions.slice(0, 3) as region, i}
		{@const regionW = S[`${region}R`]}
		{@const nextRegionW = S[`${regions[i + 1]}R`]}
		{@const outerW = (regionW / S.boardR) * width}
		{@const innerW = (nextRegionW / S.boardR) * width}
		<div
			class={region}
			style="--w: {outerW}px; --b: {(outerW - innerW) / 2}px"
		></div>
	{/each}

	<div class="twenty" style="--w: {(S.twentyR / S.boardR) * width}px;"></div>

	{#each regions as region}
		{@const text = regionText[region]}
		{@const y = (width - (S[`${region}R`] / S.boardR) * width) / 2}
		{@const extra = region === "twenty" ? (S.twentyR / S.boardR) * width : 0}
		<span class="text text-{region}" style="--y: {y + extra}px;">{text}</span>
	{/each}

	{#each angles as angle}
		<div
			class="quadrant-line"
			style="--w: {(((S.fiveR - S.tenR) / S.boardR) * width) /
				2}px; --x: {((S.tenR / S.boardR) * width) / 2}px; --angle: {angle}deg;"
		></div>
	{/each}

	{#each pegs as peg}
		<div
			class="peg"
			style="--w: {(S.pegR / S.boardR) * width}px; --x: {(((S.fifteenR -
				S.pegR) /
				S.boardR) *
				width) /
				2}px; --angle: {peg - 1}deg;"
		></div>
	{/each}
</div>

<style>
	.bg {
		position: absolute;
		top: 0;
		left: 50%;
		transform: translateX(-50%);
		pointer-events: none;
	}

	.bg > div {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: var(--w);
		height: var(--w);
		border-width: var(--b);
		border-style: solid;
		border-radius: 50%;
		transition: border-color 0.2s;
	}

	.bg .base {
		border: none;
		background: var(--color-ditch);
		outline: var(--b) solid var(--color-rim);
	}

	.bg .surface {
		border: none;
		background: var(--color-board);
	}

	.five {
		border-color: var(--color-board);
		outline: var(--outline-width) solid var(--color-line);
	}

	.ten {
		border-color: var(--color-board);
		outline: var(--outline-width) solid var(--color-line);
	}

	.fifteen {
		border-color: var(--color-board);
		outline: var(--outline-width) solid var(--color-line);
	}

	.bg .twenty {
		background: var(--color-ditch);
		border: none;
	}

	.bg .quadrant-line {
		transform-origin: 0 0;
		transform: rotate(var(--angle)) translate(var(--x), -1px);
		width: var(--w);
		height: var(--outline-width);
		border: none;
		background: var(--color-line);
		border-radius: 0;
	}

	.bg .peg {
		transform-origin: 0 0;
		transform: rotate(var(--angle))
			translate(calc(var(--x) - 0px), calc(var(--w) - 0px));
		width: var(--w);
		border: none;
		background: var(--color-peg);
	}

	span.text {
		transition: opacity 0.2s;
		position: absolute;
		top: var(--y);
		left: 50%;
		transform: translate(-50%, 8px);
		color: var(--color-fg-light);
		font-weight: bold;
		font-size: var(--14px);
	}

	.tutorial span.text {
		opacity: 1;
	}

	.tutorial-regions .five {
		border-color: var(--color-red-aa);
	}

	.tutorial-regions .ten {
		border-color: var(--color-teal-aa);
	}

	.tutorial-regions .fifteen,
	.tutorial-fifteen .fifteen {
		border-color: var(--color-purple-aaa);
	}

	.tutorial span {
		color: var(--color-fg-light);
	}

	/* .tutorial span.text-twenty {
		transform: translate(-50%, calc(var(--d) + 4px));
	} */

	.tutorial-regions span {
		color: var(--color-fg-dark);
	}

	.tutorial-regions span.text-fifteen,
	.tutorial-regions span.text-twenty,
	.tutorial-fifteen span.text-fifteen,
	.tutorial-fifteen span.text-twenty {
		color: var(--color-bg);
	}
</style>
```
  </file>
  <file path="samples/general/crokinole-shot-lab/pages/src/data/scenarios.json">
```json
{
	"fifteen": [
		{ "state": "shoot", "player": "player2", "power": 0.32, "degrees": 176 }
	],
	"opponent": [
		{
			"x": 411.7843742508332,
			"y": 436.43306454273926,
			"player": "player2",
			"score": 15
		},
		{
			"x": 341.53999999999996,
			"y": 688.5930841382143,
			"state": "shoot",
			"player": "player1",
			"power": 0.38,
			"degrees": 15
		}
	],
	"opponenttry": [
		{
			"x": 411.7843742508332,
			"y": 436.43306454273926,
			"player": "player2",
			"score": 15
		},
		{
			"state": "position",
			"player": "player1"
		}
	],
	"invalid": [
		{
			"x": 150,
			"y": 300,
			"player": "player2",
			"score": 5
		},
		{
			"state": "shoot",
			"player": "player1",
			"power": 0.21,
			"degrees": 1
		}
	],

	"open": [
		{
			"state": "shoot",
			"player": "player1",
			"random": true,
			"power": 0.3,
			"degrees": 0
		}
	],
	"opentry": [
		{ "x": 480, "y": 250, "player": "player1", "score": 10 },
		{ "state": "position", "player": "player1" }
	],

	"score": [
		{
			"x": 350,
			"y": 342,
			"player": "player1",
			"score": 15,
			"valid": true
		},
		{
			"x": 545,
			"y": 311,
			"player": "player1",
			"score": 10,
			"valid": true
		},
		{
			"x": 622,
			"y": 310,
			"player": "player2",
			"score": 5,
			"valid": true
		},
		{
			"x": 150,
			"y": 305,
			"player": "player2",
			"score": 5,
			"valid": true
		},
		{
			"x": 233,
			"y": 466,
			"player": "player2",
			"score": 10,
			"valid": true,
			"state": "idle"
		}
	],
	"ricochettry": [
		{
			"x": 420,
			"y": 460,
			"player": "player2"
		},
		{
			"player": "player1",
			"state": "position"
		}
	]
}
```
  </file>
  <file path="samples/general/crokinole-shot-lab/pages/src/data/specs.js">
```javascript
/*
		Overall playing surface diameter: 26” (13” / ~330mm radius)
		Outer circle diameter: 24” (12” / ~305mm radius)
		Middle circle diameter: 16” (8” / ~203mm radius)
		Inner circle diameter: 8” (4” / ~102mm radius)
		Ditch: 2” (~51mm) minimum
		20 hole diameter: 1 3/8” (35mm)
		20 hole depth: 1/4” (6mm)
		Dividing circle lines: 1/16” (1.5mm) to 1/8” (3mm)
		Discs: 1 1/4” x 3/8” diameter (32mm x 10mm) Standard Crokinole discs
		Rim: 1 1/2” (1/2”/12mm taller than the playing surface)
		Playing surface: 1/2” thickness on most boards.
		Peg Diameter: 3/8”
	*/

// 774 total
export const rimW = 6;
export const surfaceR = 330;
export const ditchW = 51;
export const pegR = 4.7625;
export const twentyR = 17.5;
export const fifteenR = 102;
export const tenR = 203;
export const fiveR = 305;
export const discR = 15;
export const baseR = surfaceR + ditchW;
export const boardR = baseR + rimW;
export const center = boardR;

export const uiHeight = 96;
export const scoreHeight = 39;
export const marginBottom = 32;
export const stepperPadding = 32;
export const marginSide = 0;
```
  </file>
  <file path="samples/general/crokinole-shot-lab/pages/src/data/variables.json">
```json
{
  "category": {
    "blue": "#4477AA",
    "red": "#EE6677",
    "green": "#228833",
    "yellow": "#CCBB44",
    "cyan": "#66CCEE",
    "purple": "#AA3377",
    "gray": "#BBBBBB"
  },
  "color": {
    "black": "#000000",
    "white": "#ffffff",
    "gray-50": "rgb(247, 247, 247)",
    "gray-100": "rgb(239, 239, 239)",
    "gray-200": "rgb(223, 223, 223)",
    "gray-300": "rgb(202, 202, 202)",
    "gray-400": "rgb(168, 168, 168)",
    "gray-500": "rgb(135, 135, 135)",
    "gray-600": "rgb(109, 109, 109)",
    "gray-700": "rgb(78, 78, 78)",
    "gray-800": "rgb(55, 55, 55)",
    "gray-900": "rgb(38, 38, 38)",
    "gray-1000": "rgb(25, 25, 25)",
    "pink-aa": "#FF24FF",
    "pink-aaa": "#D100D1",
    "teal-aa": "#00A3A3",
    "teal-aaa": "#008080",
    "red-aa": "#FE5F55",
    "red-aaa": "#E91101",
    "purple-aaa": "#564592"
  },
  "": {
    "11px": "0.7rem",
    "12px": "0.75rem",
    "14px": "0.875rem",
    "16px": "1rem",
    "18px": "1.125rem",
    "20px": "1.25rem",
    "22px": "1.375rem",
    "24px": "1.5rem",
    "28px": "1.75rem",
    "32px": "2rem",
    "36px": "2.25rem",
    "40px": "2.5rem",
    "44px": "2.75rem",
    "48px": "3rem",
    "56px": "3.5rem",
    "64px": "4rem",
    "80px": "5rem",
    "96px": "6rem",
    "112px": "7rem",
    "128px": "8rem"
  }
}
```
  </file>
  <file path="samples/general/crokinole-shot-lab/pages/src/main.js">
```javascript
import App from './App.svelte';new App({target:document.getElementById('app')});
```
  </file>
  <file path="samples/general/crokinole-shot-lab/pages/src/paths.js">
```javascript
export const base = ".";
```
  </file>
  <file path="samples/general/crokinole-shot-lab/pages/src/stores/misc.js">
```javascript
import { writable } from "svelte/store";

export const muted = writable(false);
```
  </file>
  <file path="samples/general/crokinole-shot-lab/pages/src/utils/crokinole.js">
```javascript
import Matter from "matter-js";
import * as S from "$data/specs.js";
import variables from "$data/variables.json";
import { Howl } from "howler";
import { muted } from "$stores/misc.js";

import { base } from "$app/paths";

const DISC_CATEGORY = 0x0001;
const PEG_CATEGORY = 0x0002;
const TRAP_CATEGORY = 0x0004;
const RIM_CATEGORY = 0x0008;
const SURFACE_CATEGORY = 0x0010;
const DISC_RESTITUTION = 1;
const DISC_DENSITY = 0.05;
const DISC_FRICTIONAIR = 0.05;
const PEG_RESTITUTION = 1;
const MAX_RATE = 0.2;

const COLOR = {
	player1: variables.color["pink-aa"],
	player2: variables.color["teal-aa"],
	active: variables.color["black"],
	vector: variables.color["black"]
};

let visible = false;
let globalMuted;

// Create a new sound
const DISC_SOUND = new Howl({
	src: [`${base}/assets/audio/disc.mp3`]
});

const RIM_SOUND = new Howl({
	src: [`${base}/assets/audio/rim.mp3`]
});

const FLICK_SOUND = new Howl({
	src: [`${base}/assets/audio/flick.mp3`]
});

const HOLE_SOUND = new Howl({
	src: [`${base}/assets/audio/hole.mp3`]
});

muted.subscribe((value) => {
	globalMuted = value;
});

// Define a simple event emitter class
class EventEmitter {
	constructor() {
		this.events = {};
	}

	// Register an event listener
	on(event, listener) {
		if (!this.events[event]) {
			this.events[event] = [];
		}
		this.events[event].push(listener);
	}

	// Emit an event
	emit(event, data) {
		if (this.events[event]) {
			this.events[event].forEach((listener) => listener(data));
		}
	}
}

export default function createCrokinoleSimulation() {
	const emitter = new EventEmitter(); // Event emitter instance

	let engine;
	let world;
	let runner;
	let render;
	let shotMaxMagnitude;
	let shotMaxIndicatorMagnitude;
	let shotVector;
	let indicatorVector;
	let indicatorVisible;
	let manual;
	let muteOverride;
	let canvasWidth;
	let discs = [];
	let state;
	let activeDisc;
	let difficulty = "easy";

	function scale(v) {
		const s = canvasWidth / (S.boardR * 2);
		return v * s;
	}

	function createZones() {
		const board = Matter.Bodies.circle(
			S.center,
			S.center,
			S.boardR,
			{
				isStatic: true,
				isSensor: true,
				render: {
					visible,
					fillStyle: "rgba(0,0,0,0)",
					lineWidth: 1
				},
				label: "surface"
			},
			64
		);

		const rim = Matter.Bodies.circle(
			S.center,
			S.center,
			S.boardR - S.rimW,
			{
				isStatic: true,
				isSensor: true,
				render: {
					visible,
					fillStyle: "rgba(0,0,0,0)",
					lineWidth: 1
				},
				label: "surface"
			},
			64
		);

		const surface = Matter.Bodies.circle(
			S.center,
			S.center,
			S.surfaceR,
			{
				isStatic: true,
				isSensor: true,
				render: {
					visible,
					fillStyle: "rgba(0,0,0,0)",
					lineWidth: 1
				},
				label: "surface"
			},
			64
		);

		const zone20 = Matter.Bodies.circle(
			S.center,
			S.center,
			S.twentyR,
			{
				isStatic: true,
				isSensor: true,
				render: {
					visible,
					fillStyle: "rgba(0,0,0,0)",
					lineWidth: 1
				},
				label: "20"
			},
			64
		);

		const zone15 = Matter.Bodies.circle(
			S.center,
			S.center,
			S.fifteenR,
			{
				isStatic: true,
				isSensor: true,
				render: {
					visible,
					fillStyle: "rgba(0,0,0,0)",
					lineWidth: 1
				},
				label: "15"
			},
			64
		);

		const zone10 = Matter.Bodies.circle(
			S.center,
			S.center,
			S.tenR,
			{
				isStatic: true,
				isSensor: true,
				render: {
					visible,
					fillStyle: "rgba(0,0,0,0)",
					lineWidth: 1
				},
				label: "10"
			},
			64
		);

		const zone5 = Matter.Bodies.circle(
			S.center,
			S.center,
			S.fiveR,
			{
				isStatic: true,
				isSensor: true,
				render: {
					visible,
					fillStyle: "rgba(0,0,0,0)",
					lineWidth: 1
				},
				label: "5"
			},
			64
		);

		Matter.Composite.add(world, [
			rim,
			board,
			surface,
			zone20,
			zone15,
			zone10,
			zone5
		]);
	}

	function createTrap20() {
		const wallCount = 16;
		const wallThickness = Math.max(2, S.twentyR);
		const wallRadius = S.twentyR + wallThickness / 2 - 1;

		const trap = [];

		for (let i = 0; i < wallCount; i++) {
			// Calculate angle for each wall
			const angle = (i / wallCount) * 2 * Math.PI;

			// Calculate the wall position around the S.center
			const wallX = S.center + Math.cos(angle) * wallRadius;
			const wallY = S.center + Math.sin(angle) * wallRadius;
			const wallLength = (2 * Math.PI * wallRadius) / wallCount;

			// Create the wall as a small static rectangle
			const wall = Matter.Bodies.rectangle(
				wallX,
				wallY,
				wallThickness,
				wallLength,
				{
					isStatic: true,
					isSensor: false,
					angle: angle,
					render: { visible: false },
					label: "trap 20",
					collisionFilter: {
						category: TRAP_CATEGORY,
						mask: DISC_CATEGORY
					}
				}
			);

			trap.push(wall);
		}

		Matter.Composite.add(world, trap);
	}

	function createTrapRim() {
		const wallCount = 32;
		const wallThickness = S.twentyR * 4;
		const wallRadius = S.baseR - S.rimW + wallThickness / 2 - 1;

		const trap = [];

		for (let i = 0; i < wallCount; i++) {
			// Calculate angle for each wall
			const angle = (i / wallCount) * 2 * Math.PI;

			// Calculate the wall position around the S.center
			const wallX = S.center + Math.cos(angle) * wallRadius;
			const wallY = S.center + Math.sin(angle) * wallRadius;
			const wallLength = (2 * Math.PI * wallRadius) / wallCount;

			// Create the wall as a small static rectangle
			const wall = Matter.Bodies.rectangle(
				wallX,
				wallY,
				wallThickness,
				wallLength,
				{
					isStatic: true,
					isSensor: false,
					angle: angle,
					render: { visible: false },
					label: "trap rim",
					collisionFilter: {
						category: RIM_CATEGORY,
						mask: DISC_CATEGORY
					}
				}
			);

			trap.push(wall);
		}

		Matter.Composite.add(world, trap);
	}

	function createTrapSurface() {
		const wallCount = 32;
		const wallThickness = S.twentyR;
		const wallRadius = S.surfaceR - wallThickness / 2 + 1;

		const trap = [];

		for (let i = 0; i < wallCount; i++) {
			// Calculate angle for each wall
			const angle = (i / wallCount) * 2 * Math.PI;

			// Calculate the wall position around the S.center
			const wallX = S.center + Math.cos(angle) * wallRadius;
			const wallY = S.center + Math.sin(angle) * wallRadius;
			const wallLength = (2 * Math.PI * wallRadius) / wallCount;

			// Create the wall as a small static rectangle
			const wall = Matter.Bodies.rectangle(
				wallX,
				wallY,
				wallThickness,
				wallLength,
				{
					isStatic: true,
					isSensor: false,
					angle: angle,
					render: { visible: false },
					label: "trap surface",
					collisionFilter: {
						category: SURFACE_CATEGORY,
						mask: DISC_CATEGORY
					}
				}
			);

			trap.push(wall);
		}

		Matter.Composite.add(world, trap);
	}

	function createPegs() {
		const pegBodies = [];
		const r = S.pegR;

		// Loop through 8 pegs
		for (let i = 0; i < 8; i++) {
			const angle = 3 / 8 + (i / 8) * Math.PI * 2;
			const x = S.center + Math.cos(angle) * S.fifteenR;
			const y = S.center + Math.sin(angle) * S.fifteenR;

			const peg = Matter.Bodies.circle(
				x,
				y,
				r,
				{
					isStatic: true,
					restitution: PEG_RESTITUTION,
					render: { visible },
					collisionFilter: {
						category: PEG_CATEGORY,
						mask: DISC_CATEGORY
					}
				},
				32
			);

			pegBodies.push(peg);
		}

		Matter.Composite.add(world, pegBodies);
	}

	function drawArrow(ctx, fromX, fromY, toX, toY, arrowLength) {
		const angle = Math.atan2(toY - fromY, toX - fromX);

		// Calculate the points for the arrowhead
		const arrowX1 = toX - arrowLength * Math.cos(angle - Math.PI / 4);
		const arrowY1 = toY - arrowLength * Math.sin(angle - Math.PI / 4);

		const arrowX2 = toX - arrowLength * Math.cos(angle + Math.PI / 4);
		const arrowY2 = toY - arrowLength * Math.sin(angle + Math.PI / 4);

		// Draw the two lines of the arrowhead
		ctx.moveTo(toX, toY);
		ctx.lineTo(arrowX1, arrowY1);

		ctx.moveTo(toX, toY);
		ctx.lineTo(arrowX2, arrowY2);
	}

	function drawIndicator(ctx) {
		if (!activeDisc) return;

		const discR = activeDisc.circleRadius;
		const discP = activeDisc.position;

		if (state === "shoot" && indicatorVector && indicatorVisible) {
			// Calculate the direction of the vector (normalized)
			const normalizedVector = Matter.Vector.normalise(indicatorVector);

			const startX = scale(discP.x + normalizedVector.x * discR * 1.25);
			const startY = scale(discP.y + normalizedVector.y * discR * 1.25);

			const endX = scale(
				discP.x + normalizedVector.x * discR * 1.5 + indicatorVector.x
			);
			const endY = scale(
				discP.y + normalizedVector.y * discR * 1.5 + indicatorVector.y
			);

			// Start drawing the main indicator line
			ctx.beginPath();
			ctx.strokeStyle = COLOR.vector;
			ctx.lineWidth = canvasWidth < 480 ? 1 : 2;

			// Draw the solid line starting from the outer edge of the disc
			ctx.moveTo(startX, startY);
			ctx.lineTo(endX, endY);
			ctx.stroke();

			// Draw the arrow at the end of the line
			const arrowLength = scale(discR * 0.75);
			const arrowAngle = Math.PI / 4; // Angle for the arrowhead

			// Calculate direction of the arrow based on the indicatorVector
			const angle = Math.atan2(indicatorVector.y, indicatorVector.x);
			const x1 = endX - arrowLength * Math.cos(angle - arrowAngle);
			const y1 = endY - arrowLength * Math.sin(angle - arrowAngle);
			const x2 = endX - arrowLength * Math.cos(angle + arrowAngle);
			const y2 = endY - arrowLength * Math.sin(angle + arrowAngle);

			// Draw the two lines of the arrowhead
			ctx.beginPath();
			ctx.moveTo(endX, endY);
			ctx.lineTo(x1, y1);
			ctx.moveTo(endX, endY);
			ctx.lineTo(x2, y2);
			ctx.stroke();
			ctx.closePath();
		} else if (state === "position" && indicatorVisible) {
			ctx.beginPath();
			ctx.strokeStyle = COLOR.vector;
			ctx.stroke();

			ctx.beginPath();
			ctx.strokeStyle = COLOR.vector;
			ctx.lineWidth = canvasWidth < 480 ? 1 : 2;

			const x1 = scale(discP.x - discR * 2.5);
			const x2 = scale(discP.x - discR * 1.25);
			const x3 = scale(discP.x + discR * 2.5);
			const x4 = scale(discP.x + discR * 1.25);
			const y = scale(discP.y);
			const r = scale(discR * 0.75);

			ctx.moveTo(x1, y);
			ctx.lineTo(x2, y);
			ctx.moveTo(x3, y);
			ctx.lineTo(x4, y);

			ctx.stroke();
			ctx.closePath();

			ctx.beginPath();
			drawArrow(ctx, x2, y, x1, y, r);
			drawArrow(ctx, x4, y, x3, y, r);
			ctx.stroke();
			ctx.closePath();
		}
	}

	function afterRender() {
		const ctx = render.context;
		drawIndicator(ctx);
	}

	function collisionActive(event) {
		// twenty hole
		event.pairs.forEach(({ bodyA, bodyB }) => {
			const disc =
				bodyA.label === "disc" ? bodyA : bodyB.label === "disc" ? bodyB : null;
			const zone20 =
				bodyA.label === "20" ? bodyA : bodyB.label === "20" ? bodyB : null;

			if (disc && zone20 && !disc.in20) {
				const dist = Matter.Vector.magnitude(
					Matter.Vector.sub(disc.position, zone20.position)
				);

				const discRadius = disc.circleRadius;

				const distThreshold = discRadius * 0.75;
				const speedThreshold = 10;

				const isClose = dist < distThreshold;
				const isSlow = disc.speed < speedThreshold;

				const enableTrap = isClose && isSlow;

				if (enableTrap) {
					if (!globalMuted && !muteOverride) {
						const v = Math.min(1, disc.speed * 0.03);

						HOLE_SOUND.volume(v);
						HOLE_SOUND.play();
					}
					disc.in20 = true;
					disc.collisionFilter.mask =
						DISC_CATEGORY | PEG_CATEGORY | RIM_CATEGORY | TRAP_CATEGORY;
					disc.restitution = 0.4;
				}
			}
		});
	}

	function collisionStart(event) {
		event.pairs.forEach(({ bodyA, bodyB }) => {
			const disc =
				bodyA.label === "disc" ? bodyA : bodyB.label === "disc" ? bodyB : null;

			const otherDisc =
				bodyA.label === "disc" && bodyA.id !== disc.id
					? bodyA
					: bodyB.label === "disc" && bodyB.id !== disc.id
						? bodyB
						: null;

			const rim =
				bodyA.label === "trap rim"
					? bodyA
					: bodyB.label === "trap rim"
						? bodyB
						: null;

			if (disc && rim) {
				if (!globalMuted && !muteOverride) {
					const v = Math.min(1, disc.speed * 0.05);
					RIM_SOUND.volume(v);
					RIM_SOUND.play();
				}
				disc.frictionAir = 0.3;
				disc.collisionFilter.mask =
					DISC_CATEGORY | PEG_CATEGORY | RIM_CATEGORY | SURFACE_CATEGORY;
			} else if (disc && otherDisc) {
				if (!globalMuted && !muteOverride) {
					const v = Math.min(1, disc.speed * 0.05);
					RIM_SOUND.volume(v);
					DISC_SOUND.play();
				}
				disc.collided = true;
				otherDisc.collided = true;
				const opp = disc.player !== otherDisc.player;
				disc.collidedOpp = opp;
				otherDisc.collidedOpp = opp;
			}
		});
	}

	function updateShotVector(target) {
		if (!activeDisc) return;
		const vector = {
			x: target.x - activeDisc.position.x,
			y: target.y - activeDisc.position.y
		};

		const normalizedVector = Matter.Vector.normalise(vector);

		const currentMagnitude = Matter.Vector.magnitude(vector);
		const indicatorMagnitude = Math.min(
			currentMagnitude,
			shotMaxIndicatorMagnitude
		);

		const shotVectorMagnitude =
			(indicatorMagnitude / shotMaxIndicatorMagnitude) * shotMaxMagnitude;

		// update vector based on clamped vector length
		shotVector = Matter.Vector.mult(normalizedVector, shotVectorMagnitude);

		// visual version
		indicatorVector = Matter.Vector.mult(normalizedVector, indicatorMagnitude);
	}

	function getZoneForDisc(disc) {
		const discR = disc.circleRadius;
		const discP = disc.position;

		const distance = Math.sqrt(
			Math.pow(discP.x - S.center, 2) + Math.pow(discP.y - S.center, 2)
		);

		const zones = [
			{ r: S.twentyR, score: 20 },
			{ r: S.fifteenR, score: 15 },
			{ r: S.tenR, score: 10 },
			{ r: S.fiveR, score: 5 }
		];

		// see if it is outside, if not move on
		const match = zones.find((zone) => distance + discR < zone.r);

		return match?.score || 0;
	}

	function getIntersect15(disc) {
		const discR = disc.circleRadius;
		const discP = disc.position;

		const distance = Math.sqrt(
			Math.pow(discP.x - S.center, 2) + Math.pow(discP.y - S.center, 2)
		);

		const zoneR = S.fifteenR;

		if (distance - discR < zoneR) return true;
	}

	function sleepStart() {
		// check if all discs sleeping
		const allSleeping = discs.every((d) => d.isSleeping);

		if (allSleeping) {
			// score
			discs.forEach((d) => {
				d.score = getZoneForDisc(d);
				d.intersect15 = getIntersect15(d);
			});

			// validate
			// opponents on board
			const hasOpps = discs.some((d) => d.player !== activeDisc.player);
			const collidedOpp = discs.some((d) => d.collidedOpp);
			const intersected15 = discs
				.filter((d) => d.player === activeDisc.player)
				.some((d) => d.intersect15);
			discs.forEach((d) => {
				// opponent on board
				if (hasOpps) {
					// same as shooter
					const samePlayer = d.player === activeDisc.player;
					if (samePlayer) {
						// if shooter
						const isShooter = d.id === activeDisc.id;
						if (isShooter) {
							d.valid = collidedOpp;
						} else {
							// if non-shooter (if it collided, one disc must have opp collided)
							d.valid = d.collided ? collidedOpp : true;
						}
					} else {
						// opp is always valid
						d.valid = true;
					}
				} else {
					// no opps on board - open 20
					if (d.id === activeDisc.id) {
						d.valid = d.collided ? intersected15 : d.intersect15;
					} else {
						// one disc must be in or on 15 or it didn't get touched
						d.valid = d.collided ? intersected15 : true;
					}
				}
				if (!d.valid || !d.score) Matter.Composite.remove(world, d);
			});

			// was active disc valid?
			const valid = discs.find((d) => d.id === activeDisc.id).valid;

			// clean up
			discs = discs.filter((d) => d.score > 0 && d.valid);

			if (manual) {
				emitter.emit("shotCompleteManual", { discs, valid });
			} else {
				const scores = discs.map((d) => ({
					id: d.id,
					player: d.player,
					score: d.score,
					valid: d.valid
				}));

				// remove 20
				discs.forEach((d) => {
					if (d.score === 20) Matter.Composite.remove(world, d);
				});

				discs = discs.filter((d) => d.score !== 20);
				activeDisc = null;

				emitter.emit("shotComplete", { discs: scores, valid });

				discs.forEach((d) => {
					d.valid = undefined;
					d.collided = undefined;
					d.collidedOpp = undefined;
					d.intersect15 = undefined;
					d.in20 = undefined;
				});
			}
		}
	}

	// public methods
	function removeDiscs() {
		discs.forEach((disc) => {
			Matter.Composite.remove(world, disc);
		});

		discs = [];
		activeDisc = null;
		indicatorVisible = false;
		indicatorVector = undefined;
		shotVector = undefined;
	}

	function addDisc(opts = {}) {
		const player = opts.player || "player1";
		const s = opts.state || "position";
		const x = opts.x ? opts.x : S.center;
		const y = opts.y
			? opts.y
			: player === "player1"
				? S.center + S.fiveR
				: S.center - S.fiveR;
		const r = S.discR;
		const density = DISC_DENSITY;
		const restitution = DISC_RESTITUTION;
		const frictionAir = DISC_FRICTIONAIR;

		const disc = Matter.Bodies.circle(
			x,
			y,
			r,
			{
				density,
				restitution,
				frictionAir,
				render: {
					fillStyle: COLOR[player]
				},
				label: "disc",
				collisionFilter: {
					category: DISC_CATEGORY,
					mask: DISC_CATEGORY | PEG_CATEGORY | RIM_CATEGORY
				},
				sleepThreshold: 60,
				isSleeping: true
			},
			64
		);

		disc.player = player;
		discs.push(disc);
		activeDisc = disc;

		Matter.Events.on(disc, "sleepStart", sleepStart);
		Matter.Composite.add(world, disc);

		shotMaxMagnitude = activeDisc.mass * MAX_RATE;

		setState(s);
		if (opts.bot) botShot();
	}

	function getBotDegrees(opps) {
		if (opps) {
			// pick a random player1 disc
			const oppDisc = discs.find((d) => d.player === "player1");
			const radians = Matter.Vector.angle(
				activeDisc.position,
				oppDisc.position
			);
			const degrees = (radians * 180) / Math.PI + 90;
			return degrees;
		} else {
			const d = Math.random() * difficulty === "hard" ? 3 : 6;
			const r = Math.random() * d;
			return 180 - d / 2 + r;
		}
	}

	function getBotPower(opps) {
		if (opps) {
			const oppDisc = discs.find((d) => d.player === "player1");
			const distance = Matter.Vector.magnitude(
				Matter.Vector.sub(activeDisc.position, oppDisc.position)
			);
			const maxDistance = S.surfaceR * 2;
			const r = difficulty === "hard" ? 0.05 : 0.1;
			const pow = Math.max(
				0.01,
				Math.random() * r + 1 - distance / maxDistance - r
			);
			return pow;
		} else {
			// smaller range if difficulty is hard
			if (difficulty === "hard") return 0.15 + Math.random() * 0.2;
			else return 0.15 + Math.random() * 0.35;
		}
	}

	function calculatePower(target) {
		const distance = Matter.Vector.magnitude(
			Matter.Vector.sub(activeDisc.position, target)
		);

		// Normalize distance relative to board size (surface radius)
		const maxDistance = S.surfaceR * 2;
		const minPower = 0.1;
		const maxPower = 1.0;

		// Scale the power based on the distance (closer = less power, farther = more power)
		let power = (distance / maxDistance) * maxPower;

		// Clamp the power to a reasonable range
		power = Math.max(minPower, Math.min(maxPower, power));

		return power;
	}

	function evaluateShot(degrees) {
		// Calculate the target position based on the shot degrees
		const target = getTarget({ degrees, speed: 1, random: false }); // Speed 1 for calculating the target

		// Calculate power dynamically based on the distance to the target
		const power = calculatePower(target);

		let score = 0;

		// Check if the shot will hit an opponent's disc (best case)
		const oppHit = discs.some((disc) => {
			return (
				disc.player === "player1" &&
				Matter.Vector.magnitude(Matter.Vector.sub(disc.position, target)) <
					S.discR
			);
		});

		// Check if the shot will hit the bot's own disc (penalized case)
		const ownHit = discs.some((disc) => {
			return (
				disc.player === activeDisc.player &&
				disc.id !== activeDisc.id &&
				Matter.Vector.magnitude(Matter.Vector.sub(disc.position, target)) <
					S.discR
			);
		});

		// Check if the shot will hit a peg (penalized case)
		const pegHit = discs.some(
			(disc) =>
				disc.label === "peg" &&
				Matter.Vector.magnitude(Matter.Vector.sub(disc.position, target)) <
					S.pegR
		);

		// Score the shot
		if (oppHit) {
			score += 3; // Best outcome, hitting an opponent's disc
		}
		if (ownHit) {
			score -= 1; // Penalize hitting own disc
		}
		if (pegHit) {
			score -= 1; // Penalize hitting a peg
		}

		return { score, power };
	}

	function getOptimalShot() {
		let bestPosition = null;
		let bestDegrees = null;
		let bestPower = null;
		let bestScore = -Infinity;

		// Try a set of candidate positions around the 5-point circle
		const attempts = 20;
		// test from 0.21 to 0.79
		for (let i = 0; i < attempts; i++) {
			const p = 0.21 + (0.79 - 0.21) * (i / attempts);
			positionDisc(p * S.boardR * 2);

			// Try different angles for each position
			// only do the ones that are possible
			for (let angle = 90; angle < 270; angle += 1) {
				const { score, power } = evaluateShot(angle);

				if (score > bestScore) {
					bestScore = score;
					bestPosition = p;
					bestDegrees = angle;
					bestPower = power; // Now calculated based on distance
				}
			}
		}

		return { bestPosition, bestDegrees, bestPower, bestScore };
	}

	function botShot() {
		const opps = discs.some((d) => d.player === "player1");

		if (difficulty === "hard") {
			const { bestPosition, bestDegrees, bestPower, bestScore } =
				getOptimalShot();

			// If we found a good shot, use it
			if (bestScore > 0) {
				positionDisc(bestPosition * S.boardR * 2);
				setState("shoot");
				aimDisc({
					degrees: bestDegrees,
					power: bestPower,
					visible: false,
					random: false
				});
				setTimeout(() => {
					flickDisc({ degrees: bestDegrees, power: bestPower });
				}, 2000);
				return;
			}
		}

		// Default to a basic shot if no optimal shot is found
		const position = opps ? 0.21 + Math.random() * (0.79 - 0.21) : 0.5;
		positionDisc(position * S.boardR * 2);
		const degrees = getBotDegrees(opps);
		const power = getBotPower(opps);
		setState("shoot");
		aimDisc({ degrees, power, visible: false, random: false });
		setTimeout(() => {
			flickDisc({ degrees, power });
		}, 2000);
	}

	function positionDisc(inputX) {
		if (!activeDisc || state !== "position") return;
		const buffer = 2;
		const angles = [45 - buffer, 135 + buffer];

		// Clamp diffX to be within the bounds of the five circle's radius
		const diffX = Math.max(-S.fiveR, Math.min(S.fiveR, inputX - S.center));

		const p1 = activeDisc.player === "player1";
		const mult = p1 ? -1 : 1;
		const minAngle = angles[p1 ? 0 : 1] * mult * -1;
		const maxAngle = angles[p1 ? 1 : 0] * mult * -1;
		// Calculate the y-coordinate based on the clamped diffX
		const y =
			S.center -
			Math.sqrt(Math.max(0, Math.pow(S.fiveR, 2) - Math.pow(diffX, 2))) * mult;

		// Set the disc's position to the clamped x and calculated y
		const newPosition = { x: S.center + diffX, y };
		const radians = Matter.Vector.angle(
			{ x: S.center, y: S.center },
			newPosition
		);
		const degrees = (radians * 180) / Math.PI;
		if (degrees > minAngle && degrees < maxAngle) {
			Matter.Body.setPosition(activeDisc, newPosition);
		} else if (degrees <= minAngle) {
			const radiansClamped = (minAngle * Math.PI) / 180;
			const a = Math.cos(radiansClamped) * S.fiveR;
			const b = Math.sin(radiansClamped) * S.fiveR;
			const x = S.center + a;
			const y = S.center + b;
			Matter.Body.setPosition(activeDisc, { x, y });
		} else if (degrees >= maxAngle) {
			const radiansClamped = (maxAngle * Math.PI) / 180;
			const a = Math.cos(radiansClamped) * S.fiveR;
			const b = Math.sin(radiansClamped) * S.fiveR;
			const x = S.center + a;
			const y = S.center + b;
			Matter.Body.setPosition(activeDisc, { x, y });
		}
	}

	function getOscillatingValue(speed) {
		const opps = discs.some((d) => d.player !== activeDisc.player);

		// Get the current time in milliseconds
		const time = Date.now();

		// Use a sine wave to oscillate the value between -2 and 2
		// Multiply time by speed to make oscillation faster with higher speed
		const mult = opps ? 2 : 3 * (difficulty === "easy" ? 0.67 : 1);
		const o = (time / Math.pow(10, 13)) * speed * mult;

		// more if empty board for harder 20s

		const wiggle = opps ? 2 : 3 * (difficulty === "easy" ? 0.67 : 1);
		return wiggle * Math.sin(o); // 0.001 is a scaling factor for smooth oscillation
	}

	function getTarget({ degrees, speed, random }) {
		const offset = random ? getOscillatingValue(speed) : 0;
		const radians = ((degrees + offset - 90) * Math.PI) / 180;
		const x = activeDisc.position.x + Math.cos(radians);
		const y = activeDisc.position.y + Math.sin(radians);

		// make the target maxVectorIndicatorMagnitude away from the activeDisc position
		const target = {
			x: activeDisc.position.x + (x - activeDisc.position.x) * speed,
			y: activeDisc.position.y + (y - activeDisc.position.y) * speed
		};

		return target;
	}

	function aimDisc({ degrees, power, visible, random }) {
		if (!activeDisc || state !== "shoot") return;

		const v = visible === undefined ? true : visible;
		setIndicatorVisible(v);

		const speed = Math.max(0.01, power) * shotMaxIndicatorMagnitude;
		const target = getTarget({ degrees, speed, random });
		updateShotVector(target);
	}

	function flickDisc() {
		if (!activeDisc || state !== "shoot") return;

		setState("play");

		setIndicatorVisible(false);

		Matter.Body.applyForce(activeDisc, activeDisc.position, shotVector);

		if (!globalMuted && !muteOverride) {
			const v = Math.min(1, Matter.Vector.magnitude(shotVector) * 0.4);
			FLICK_SOUND.volume(v);
			FLICK_SOUND.play();
		}
	}

	function setDifficulty(d) {
		difficulty = d;
	}

	function setState(v) {
		state = v;
	}

	function autoMute(v) {
		muteOverride = v;
	}

	function setIndicatorVisible(v) {
		indicatorVisible = v;
	}

	function resize(w) {
		if (render) {
			canvasWidth = w;
			render.canvas.width = w;
			render.canvas.height = w;

			Matter.Render.setSize(render, w, w);
			Matter.Render;

			Matter.Render.lookAt(render, {
				min: { x: 0, y: 0 },
				max: { x: S.boardR * 2, y: S.boardR * 2 }
			});
		}
	}

	function init({ element, width, tutorial }) {
		manual = !!tutorial;

		shotMaxIndicatorMagnitude = S.center * 0.2;

		engine = Matter.Engine.create({
			enableSleeping: true
		});
		world = engine.world;

		engine.gravity.y = 0;

		runner = Matter.Runner.create();

		render = Matter.Render.create({
			element,
			engine,
			options: {
				width: S.boardR * 2,
				height: S.boardR * 2,
				wireframes: false,
				pixelRatio: "auto",
				background: "transparent",
				showSleeping: false,
				hasBounds: true
			}
		});

		createZones();
		createPegs();
		createTrap20();
		createTrapRim();
		createTrapSurface();

		Matter.Runner.run(runner, engine);
		Matter.Render.run(render);

		resize(width);

		Matter.Events.on(render, "afterRender", afterRender);
		Matter.Events.on(engine, "collisionActive", collisionActive);
		Matter.Events.on(engine, "collisionStart", collisionStart);

		emitter.emit("ready");
	}

	return {
		destroy() { Matter.Runner.stop(runner); Matter.Render.stop(render); Matter.Composite.clear(world, false); Matter.Engine.clear(engine); render.canvas.remove(); },
		snapshot() { return discs.map(d => ({player:d.player,x:d.position.x,y:d.position.y,score:d.score,valid:d.valid})); },
		removeDiscs,
		addDisc,
		positionDisc,
		aimDisc,
		flickDisc,
		setDifficulty,
		setState,
		setIndicatorVisible,
		autoMute,
		resize,
		init,
		on: (event, listener) => emitter.on(event, listener)
	};
}
```
  </file>
  <omitted path="build/assets/index-s_V-KdBH.css">Locally shipped runtime build or library dependency; readable author components and styles are included in this bundle.</omitted>
  <omitted path="build/assets/index.dev-F0dTH2W0.js">Locally shipped runtime build or library dependency; readable author components and styles are included in this bundle.</omitted>
</sample>
