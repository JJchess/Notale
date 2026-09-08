<sample id="state-maze-stories" category="general" variant="full">
  <file path="samples/general/state-maze-stories/pages/index.html">
```html
<!doctype html><html lang="zh-CN">
<script type="module" crossorigin src="./build/build-f66bb0e3.js"></script>
<link rel="stylesheet" href="./build/build-534e080e.css">
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>一张地图，51 条不同的路</title><div id="app"></div></html>
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/Mini.svelte">
```svelte
<script>
import Pick from '$components/Pick.svelte';
import Dashboard from '$components/Dashboard/Dashboard.svelte';
import Methodology from '$components/Methodology.svelte';
import copy from '$data/copy.json';
import states from '$data/states.csv';
import {selectedState,revealMethods} from '$stores/misc.js';
import {onMount} from 'svelte';
const props=(type)=>copy.body.flatMap(s=>s.content).find(d=>d.type===type)?.value;
onMount(()=>{const id=new URLSearchParams(location.search).get('state');if(states.some(s=>s.id===id))setTimeout(()=>{document.getElementById('dashboard').scrollIntoView();$selectedState=id},100)});
</script>
<svelte:window on:keydown={e=>{if(e.key==='Escape')$selectedState=undefined}}/>
<header class="mini-header"><a href="../../../../../index.html" target="_top">← Pudding Samples</a><span>2024-10-17 · 原作政策快照</span><a href="SAMPLE.md">Review 记录</a></header>
<div class="mini-intro"><h1>一张地图，51 条不同的路</h1><p>保留原作的 51 个州及特区迷宫、六段人物故事与全部插画。选择故事，或向下浏览地图。</p><p>以下政策及叙事保留原作历史语境，数据更新截止 2024 年 10 月 17 日。</p><a href="https://pudding.cool/2024/10/abortion-mazes/" target="_blank" rel="noreferrer">Jan Diehm & Michelle Pera-McGhee · The Pudding 原作 ↗</a></div>
<section id="pick"><Pick {...props('Pick')}/></section>
<section id="dashboard"><Dashboard {...props('Dashboard')}/></section>
<section id="methodology" class:visible={$revealMethods}><Methodology {...props('Methodology')}/></section>
<style>.mini-header{display:flex;justify-content:space-between;gap:18px;padding:20px 28px;font:13px var(--sans);flex-wrap:wrap}.mini-intro{max-width:850px;margin:45px auto;text-align:center;padding:0 24px}.mini-intro h1{font:700 40px var(--serif)}.mini-intro p{font:16px/1.7 var(--sans);margin:12px 0}.mini-intro a{font:14px var(--sans)}#methodology{display:none}#methodology.visible{display:flex}:global(#pick){margin-bottom:4rem} @media(max-width:600px){.mini-intro h1{font-size:28px}}</style>
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/components/Dashboard/Bar.svelte">
```svelte
<script>
	import Select from "$components/helpers/Select.svelte";
	import states from "$data/states.csv";
	import { getContext } from "svelte";
	import { selectedState, revealMethods } from "$stores/misc.js";
	import viewport from "$stores/viewport.js";
	import mq from "$stores/mq.js";
	import _ from "lodash";
	import infoIcon from "$svg/info.svg";

	const { getOrder } = getContext("dashboard");
	const order = getOrder();

	let selectState = "default";

	const highlightOptions = [
		{ label: "Select state", value: "default" },
		..._.orderBy(
			states.map((d) => ({ label: _.startCase(d.name), value: d.id })),
			"label"
		)
	];

	const methodology = () => {
		if ($revealMethods) return;
		$revealMethods = true;
		const el = document.getElementById("methodology");
		if (!el) return;
		el.classList.toggle("visible");
		el.scrollIntoView({
			behavior: $mq.reducedMotion ? "instant" : "smooth",
			block: "start"
		});
	};
	const resetInputs = () => {
		selectState = "default";
	};

	$: orderOptions = [
		{ label: "Alphabetically", value: "alpha" },
		{ label: "Geographically", value: "geo" },
		{ label: "Regionally", value: "region" },
		{ label: "By barriers", value: "barriers" }
	].filter((d) => (mobile ? d.value !== "geo" : d));
	$: mobile = $viewport.width < 600;
	$: if (selectState && selectState !== "default") $selectedState = selectState;
	$: if (!$selectedState) resetInputs();
</script>

<div class="bar" class:fade={$selectedState}>
	<div class="selects">
		<div class="select">
			<Select label={"Sort"} options={orderOptions} bind:value={$order} />
		</div>

		<div class="select">
			<Select
				label={"Go to"}
				options={highlightOptions}
				bind:value={selectState}
			/>
		</div>
	</div>

	<button class="methods" on:click={methodology}>
		<span class="text-only">
			{$viewport.width < 700 ? "" : "Methodology"}
		</span>
		<span>{@html infoIcon}</span>
	</button>
</div>

<style>
	.bar {
		background: var(--color-tan);
		border-bottom: 1px solid var(--color-dark-tan);
		color: var(--color-fg);
		font-size: 0.9rem;
		display: flex;
		justify-content: space-between;
		padding: 1rem;
		position: sticky;
		bottom: 0;
		z-index: 1001;
		height: 70px;
		width: 100%;
		transition: opacity calc(var(--1s) * 0.3);
	}
	.bar.fade {
		opacity: 0.2;
	}
	.selects,
	.methods {
		display: flex;
		align-items: center;
	}
	.methods {
		background: none;
		padding: 0;
		color: var(--color-fg);
	}
	.methods:hover .text-only {
		color: var(--color-dark-tan);
	}
	:global(.methods:hover span svg path) {
		fill: var(--color-dark-tan);
	}
	.methods span {
		display: flex;
		width: 1.2rem;
		margin-left: 0.5rem;
	}
	.methods .text-only {
		display: flex;
		margin: 0;
		width: auto;
	}
	.selects {
		gap: 1rem;
	}
	.select {
		width: fit-content;
	}

	@media (max-width: 500px) {
		.bar {
			height: auto;
			padding: 0.5rem;
			align-items: start;
		}
		.selects {
			flex-direction: column;
			align-items: start;
			gap: 0.5rem;
		}
	}

	/* @media (max-width: 600px) {
		.bar {
			height: auto;
			flex-direction: column;
			align-items: center;
			font-size: 0.8rem;
		}
		.selects {
			flex-direction: column;
			align-items: center;
			gap: 0.5rem;
			margin-bottom: 0.5rem;
		}
	} */
</style>
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/components/Dashboard/Dashboard.svelte">
```svelte
<script>
	import Grid from "$components/Dashboard/Grid.svelte";
	import Bar from "$components/Dashboard/Bar.svelte";
	import Modal from "$components/Modal/Modal.svelte";
	import { setContext } from "svelte";
	import { writable } from "svelte/store";
	import viewport from "$stores/viewport.js";

	export let doneMessage;
	export let complexitySentences;
	export let banSentences;

	const sentences = { complexitySentences, banSentences };

	setContext("dashboard", {
		getOrder: () => order,
		getColumnWidth: () => columnWidth
	});

	const order = writable("geo");
	const columnWidth = writable(0);

	$: mobile = $viewport.width < 600;
	$: if (mobile) $order = "alpha";
</script>

<Grid {doneMessage} />
<Bar />
<Modal {sentences} />

<style>
	:global(#dashboard) {
		position: relative;
	}
</style>
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/components/Dashboard/Grid.svelte">
```svelte
<script>
	import State from "$components/Dashboard/State.svelte";
	import states from "$data/states.csv";
	import viewport from "$stores/viewport.js";
	import { onMount, tick, getContext } from "svelte";
	import { selectedState } from "$stores/misc.js";
	import _ from "lodash";
	import localStorage from "$utils/localStorage.js";
	import plusIcon from "$svg/plus.svg";

	export let doneMessage;

	const { intro, getOrder, getColumnWidth } = getContext("dashboard");
	const order = getOrder();
	const columnWidth = getColumnWidth();

	const regions = _.uniq(states.map((d) => d.region));
	const sortFns = {
		geo: (d) => `${d.row}-${d.col}`,
		alpha: (d) => d.name,
		region: (d) => d.region,
		barriers: (d) => {
			if (d.ban === "true") return -1;
			return +d.score;
		}
	};

	let mazesSolved = [];

	const measure = async () => {
		await tick();
		$columnWidth = document.querySelector("figure .state")?.clientWidth;
	};
	const loadSolved = () => {
		mazesSolved = localStorage.get("mazes") || [];
	};

	onMount(() => {
		measure();
		loadSolved();

		// clear local storage
		// localStorage.remove("mazes");
	});

	$: sortedStates = _.orderBy(
		states,
		sortFns[$order],
		$order === "barriers" ? "desc" : "asc"
	);
	$: geo = $order === "geo";
	$: if (!$selectedState) loadSolved();
	$: if ($viewport.width && $order) measure();
</script>

<div class="grid-wrapper">
	<figure id="grid" class:geo class:intro class:fade={$selectedState}>
		<div class="tracker" class:hasBorder={!geo}>
			<p class="tracker-sentence">
				You've completed {mazesSolved.length === 51
					? "all "
					: `${mazesSolved.length}/`}51 mazes.
				{#if mazesSolved.length === 51}
					<span class="done">
						{@html doneMessage}
					</span>
				{/if}
			</p>
			{#if mazesSolved.length !== 51}
				<div class="maze-directions">
					<p>
						Select a state maze to try to solve it. States with <span
							class="icon">{@html plusIcon}</span
						> plus signs have personal stories.
					</p>
				</div>
			{/if}
		</div>

		{#if $order === "region"}
			{#each regions as region}
				{@const regionStates = sortedStates.filter((d) => d.region === region)}
				<h3>{_.startCase(region)}</h3>
				{#each regionStates as { id, name }}
					{@const label = _.startCase(name)}
					<State {id} {label} solved={mazesSolved.find((d) => d.id === id)} />
				{/each}
			{/each}
		{:else}
			{#if $order === "barriers"}
				<h3>Most to fewest barriers</h3>
			{/if}
			{#each sortedStates as { id, name, row, col, story }}
				{@const label = geo ? id.toUpperCase() : _.startCase(name)}
				<State
					{id}
					{label}
					{row}
					{col}
					{story}
					solved={mazesSolved.find((d) => d.id === id)}
				/>
			{/each}
		{/if}
	</figure>
</div>

<style>
	.grid-wrapper {
		width: 100%;
	}
	figure {
		display: grid;
		height: auto;
		max-width: min(100%, 900px);
		grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
		gap: 1rem;
		padding: 1.5rem 1rem;
		margin: auto;
		transition: opacity calc(var(--1s) * 0.3);
	}
	figure.fade {
		opacity: 0;
		pointer-events: none;
	}
	figure.intro {
		padding: 0;
		height: 100%;
	}
	figure.geo {
		grid-template-columns: repeat(12, minmax(0, 1fr));
		grid-template-rows: repeat(8, minmax(0, 1fr));
		gap: 0;
	}
	h3 {
		font-family: var(--serif);
		grid-column: 1/-1;
		margin: 2rem 0 0 0;
		font-size: var(--24px);
		font-weight: 700;
		padding: 0 0 0 0.25rem;
	}
	.tracker {
		color: var(--color-accent-orange);
		font-weight: bold;
		font-size: var(--18px);
		grid-column: 1 / -1;
		grid-row: 1;
		text-align: center;
		position: sticky;
		top: 0;
		background: rgba(255, 253, 248, 0.95);
		z-index: 1000;
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.tracker.hasBorder {
		border-bottom: 1px solid var(--color-tan);
		height: auto;
		padding: 0.5rem 0;
	}
	.geo .tracker {
		position: static;
		grid-row: 1 / 3;
		grid-column: 3 / 11;
		border-bottom: none;
		background: none;
	}
	.done {
		font-weight: normal;
		display: block;
	}
	.tracker-sentence {
		font-size: var(--14px);
		margin: 0;
	}
	.maze-directions {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		max-width: 360px;
	}
	.maze-directions p {
		color: var(--color-fg);
		font-weight: 500;
		font-size: var(--14px);
		margin: 0;
		font-style: italic;
	}
	span.icon {
		height: 17px;
		width: 17px;
		display: inline-block;
		margin: 0 1px 0 2px;
		position: relative;
		top: 3px;
	}

	@media (max-width: 700px) {
		figure {
			padding: 1.5rem 1rem;
		}
		.tracker {
			border-bottom: 1px solid var(--color-tan);
		}
		.maze-directions p {
			font-size: var(--12px);
			line-height: 1;
		}
		span.icon {
			margin: 0 0 0 0;
			top: 4px;
		}
		.tracker-sentence {
			font-size: var(--12px);
		}
	}

	@media (max-width: 500px) {
		.tracker {
			padding: 0.5rem;
		}
	}
</style>
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/components/Dashboard/State.svelte">
```svelte
<script>
	import { getContext } from "svelte";
	import { selectedState } from "$stores/misc.js";
	import _ from "lodash";
	import states from "$data/states.csv";
	import checkIcon from "$svg/check-orange.svg";
	import plusIcon from "$svg/plus.svg";

	export let id;
	export let label;
	export let row;
	export let col;
	export let story;
	export let solved;

	const { getOrder, getColumnWidth } = getContext("dashboard");
	const order = getOrder();
	const columnWidth = getColumnWidth();

	const longNames = [
		{ id: "dc", shortened: "D.C." },
		{ id: "nc", shortened: "N. Carolina" },
		{ id: "sc", shortened: "S. Carolina" },
		{ id: "wv", shortened: "W. Virginia" },
		{ id: "nm", shortened: "N. Mexico" },
		{ id: "ma", shortened: "Mass." },
		{ id: "nh", shortened: "New Hamp." },
		{ id: "nd", shortened: "N. Dakota" },
		{ id: "sd", shortened: "S. Dakota" },
		{ id: "pa", shortened: "Penn." },
		{ id: "ri", shortened: "Rhode I." },
		{ id: "ct", shortened: "Conn." },
		{ id: "wa", shortened: "Wash." },
		{ id: "tn", shortened: "Tenn." }
	];
	let labelWidth;

	$: geo = $order === "geo";

	const onClick = (e) => {
		const id = e.target.id.replace("-state", "");
		$selectedState = id;
	};
	const onKeyDown = (e) => {
		if (e.keyCode === 13 || e.keyCode === 32) {
			const id = e.target.id.replace("-state", "");
			$selectedState = id;
		}
	};
</script>

<div
	class="state"
	class:geo
	{id}
	style={row && col ? `--row: ${row}; --col: ${col}` : null}
	on:click={onClick}
	on:keydown={onKeyDown}
	role="button"
	tabindex="0"
>
	<div class="abbrev">
		{#if longNames.find((d) => d.id === id)}
			<div
				class="text"
				bind:clientWidth={labelWidth}
				class:visible={labelWidth <= $columnWidth}
			>
				{label}
			</div>
			<div class="shortened text" class:visible={labelWidth > $columnWidth}>
				{longNames.find((d) => d.id === id).shortened}
			</div>
		{:else}
			<div class="text visible">{label}</div>
		{/if}

		{#if story}
			<span class="icon">{@html plusIcon}</span>
		{/if}
	</div>

	<div class="img-wrapper">
		<img
			src={`assets/img/states/${id}.png`}
			alt={`maze for ${states.find((d) => d.id === id).name}`}
		/>

		<span class="check" class:visible={solved}>{@html checkIcon}</span>
	</div>
</div>

<style>
	.state {
		display: flex;
		flex-direction: column;
		align-items: center;
		grid-row: auto;
		grid-column: auto;
		padding: 0.25rem;
	}
	.state:hover {
		cursor: pointer;
		outline: 3px solid var(--color-accent-orange);
		border-radius: 3px;
	}
	.state:hover img {
		opacity: 0.8;
	}
	.state:hover .abbrev {
		font-weight: bold;
		color: var(--color-fg);
	}
	.state.geo {
		grid-row: var(--row);
		grid-column: var(--col);
	}
	.abbrev {
		position: relative;
		font-family: var(--sans);
		color: var(--color-dark-tan);
		text-align: center;
		pointer-events: none;
		white-space: nowrap;
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		width: 100%;
	}
	.text {
		grid-column: 2;
		text-align: center;
		visibility: hidden;
	}
	.icon {
		height: 14px;
		width: 14px;
		display: grid;
		grid-column: 3;
		justify-self: end;
	}
	.visible {
		visibility: visible;
	}
	.shortened {
		position: absolute;
		top: 0px;
		left: 50%;
		transform: translate(-50%, 0);
	}
	.img-wrapper {
		position: relative;
		pointer-events: none;
		width: 100%;
	}
	img {
		opacity: 0.5;
	}
	.check {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%) scale(0);
		height: 20px;
		width: 20px;
		border-radius: 50%;
		outline: 2px solid var(--color-bg);
		background: var(--color-bg);
		visibility: hidden;
		transition: transform calc(var(--1s) * 0.5) var(--1s) ease-in-out;
	}
	.check.visible {
		transform: translate(-50%, -50%) scale(1);
		visibility: visible;
	}

	@media (max-width: 800px) {
		.state {
			font-size: 0.8rem;
			line-height: 1.25;
		}
	}
</style>
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/components/Maze/Keys.Desktop.svelte">
```svelte
<script>
	import Icon from "$components/helpers/Icon.svelte";
	import { getContext } from "svelte";

	const { getGameState } = getContext("maze");
	const gameState = getGameState();
</script>

<div class="container">
	<div class="keys">
		{#each ["up", "left", "down", "right"] as direction}
			<span class={`key ${direction}`}>
				<Icon name={`arrow-${direction}`} />
			</span>
		{/each}
	</div>
	<div class="text">Use arrow keys to navigate</div>
</div>

<style>
	.container {
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.text {
		font-family: var(--sans);
		color: var(--color-dark-tan);
		font-size: 0.9rem;
		margin-top: 4px;
		text-align: center;
		max-width: 100px;
	}
	.keys {
		display: grid;
		grid-template-rows: 22px 22px;
		grid-template-columns: 22px 22px 22px;
		gap: 4px;
	}
	.key {
		background: var(--color-tan);
		color: #34373e;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
		border-radius: 3px;
		font-size: 0.7rem;
	}
	span.up {
		grid-row: 1;
		grid-column: 2;
	}
	span.left {
		grid-row: 2;
		grid-column: 1;
	}
	span.down {
		grid-row: 2;
		grid-column: 2;
	}
	span.right {
		grid-row: 2;
		grid-column: 3;
	}

	@media(max-width: 700px) {
		.keys {
			grid-template-rows: 18px 18px;
			grid-template-columns: 18px 18px 18px;
			gap: 2px;
		}
		.text {
			font-size: var(--12px);
		}
	}
</style>
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/components/Maze/Keys.Mobile.svelte">
```svelte
<script>
	import Icon from "$components/helpers/Icon.svelte";
	import { getContext } from "svelte";

	const { getData, getGameState, getSpaceAvailable, getPath, getLocation } =
		getContext("maze");
	const data = getData();
	const gameState = getGameState();
	const spaceAvailable = getSpaceAvailable();
	const path = getPath();
	const location = getLocation();

	const move = (direction) => {
		const current = $data.find(
			(d) => d.row === $location.row && d.col === $location.col
		);
		const [top, right, bottom, left] = current.walls;

		const validLeft = direction === "left" && !left;
		const validRight = direction === "right" && !right;
		const validUp = direction === "up" && !top;
		const validDown = direction === "down" && !bottom;

		if (validLeft || validRight || validUp || validDown) {
			if (validLeft) {
				$location = { row: $location.row, col: $location.col - 1 };
			} else if (validUp) {
				$location = { row: $location.row - 1, col: $location.col };
			} else if (validRight) {
				$location = { row: $location.row, col: $location.col + 1 };
			} else if (validDown) {
				$location = { row: $location.row + 1, col: $location.col };
			}
			$path = [...$path, $location];
		}
	};
</script>

<div
	class="mobile-controls"
	style:width={`${$spaceAvailable}px`}
	style:height={`${$spaceAvailable}px`}
	class:active={$gameState === "mid"}
>
	{#each ["up", "right", "down", "left"] as direction}
		<button
			class={direction}
 aria-label={`Move ${direction}`}
			disabled={$gameState !== "mid"}
			on:click={() => move(direction)}
			><Icon name={`arrow-${direction}`} /></button
		>
	{/each}
</div>

<style>
	.mobile-controls {
		position: absolute;
		top: 0;
		pointer-events: none;
	}
	.active {
		pointer-events: auto;
	}
	button {
		position: absolute;
		color: var(--color-bg);
		background: var(--color-medium-tan);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.8rem;
		touch-action: manipulation;
	}
	button.up {
		top: 0;
		left: 50%;
		transform: translate(-50%, -120%);
		display: flex;
		align-items: center;
	}
	button.down {
		bottom: 0;
		left: 50%;
		transform: translate(-50%, 120%);
	}
	button.left {
		top: 50%;
		left: 0;
		transform: translate(-120%, -50%);
	}
	button.right {
		top: 50%;
		right: 0;
		transform: translate(120%, -50%);
	}

	@media (hover: hover) and (pointer: fine) {
		button {
			touch-action: auto;
		}
	}
</style>
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/components/Maze/Maze.svelte">
```svelte
<script>
	import Walls from "$components/Maze/Walls.svelte";
	import Path from "$components/Maze/Path.svelte";
	import Overlay from "$components/Maze/Overlay.svelte";
	import KeysDesktop from "$components/Maze/Keys.Desktop.svelte";
	import KeysMobile from "$components/Maze/Keys.Mobile.svelte";
	import { writable } from "svelte/store";
	import { onMount, setContext } from "svelte";
	import { pathLength, globalGameState, selectedState } from "$stores/misc.js";
	import viewport from "$stores/viewport.js";
	import mq from "$stores/mq.js";
	import _ from "lodash";
	import localStorage from "$utils/localStorage.js";

	export let availableSpace;
	export let wallData;
	export let numCells;
	export let animated;
	export let loading = false;
	export let mazePath = [{ row: 0, col: 0 }];

	const data = writable(wallData);
	const solution = writable([]);
	const spaceAvailable = writable(0);
	const mazeSize = writable(0);
	const dims = writable(0);
	const cellSize = writable(0);
	const wallWidth = writable(0);
	const padding = writable(0);
	const location = writable({ row: 0, col: 0 });
	const path = writable(mazePath);
	const gameState = writable("pre");
	const userSolved = writable(true);
	const started = writable(false);
	const mobilePadding = 3;

	setContext("maze", {
		wallWidth,
		animated,
		getData: () => data,
		getSolution: () => solution,
		getCellSize: () => cellSize,
		getWallWidth: () => wallWidth,
		getSpaceAvailable: () => spaceAvailable,
		getMazeSize: () => mazeSize,
		getDims: () => dims,
		getPadding: () => padding,
		getLocation: () => location,
		getPath: () => path,
		getGameState: () => gameState,
		getUserSolved: () => userSolved,
		getStarted: () => started
	});

	const start = () => {
		$started = true;
		$gameState = "mid";
	};
	const reset = () => {
		$gameState = "mid";
		$location = { row: 0, col: 0 };
		$userSolved = true;
	};
	const solve = async () => {
		$userSolved = false;
		const solution = _.orderBy(
			$data.filter((d) => d.solutionIndex !== null),
			"solutionIndex",
			"asc"
		);
		$path = solution;
		$gameState = "post";
		$location = { row: $dims - 1, col: $dims - 1 };
	};
	const logSolve = () => {
		const current = localStorage.get("mazes");
		if (!current) {
			localStorage.set("mazes", [{ id: $selectedState, path: $path }]);
		} else {
			localStorage.set("mazes", [
				...current.filter((d) => d.id !== $selectedState),
				{ id: $selectedState, path: $path }
			]);
		}
	};

	$: $globalGameState = $gameState;
	$: $data = wallData;
	$: $path = mazePath;
	$: $spaceAvailable = availableSpace;
	$: $mazeSize = availableSpace;
	$: $dims = numCells;
	$: mobile = $viewport.width < 600;
	$: withPadding = mobile;
	$: $wallWidth = $dims >= 16 ? $mazeSize / 100 : $mazeSize / 50;
	$: $padding = $wallWidth / 2;
	$: $cellSize = $dims ? ($mazeSize - $padding * 2) / $dims : 0;
	$: $pathLength = $path.length - 1;
	$: $solution = _.orderBy(
		_.flatten(wallData).filter((d) => d.solutionIndex !== null),
		"solutionIndex",
		"asc"
	);
	$: if ($location.row === $dims - 1 && $location.col === $dims - 1) {
		if ($userSolved) logSolve();
		$gameState = "post";
	}

	onMount(() => {
		const mazesSolved = localStorage.get("mazes");
		const alreadySolved =
			mazesSolved && mazesSolved.find((d) => d.id === $selectedState);
		if (alreadySolved) {
			$path = alreadySolved.path;
			$location = { row: $dims - 1, col: $dims - 1 };
			$started = true;
			$gameState = "post";
		}
	});
</script>

<div class="maze-container" data-row={$location.row} data-col={$location.col} data-game={$gameState} data-path-length={$path.length} style:width={`${$spaceAvailable}px`}>
	{#if $mazeSize && $mazeSize > 0}
		<svg width={$mazeSize} height={$mazeSize}>
			{#if !loading}
				<g
					style:transform={withPadding
						? `translate(${mobilePadding / 2}px, 0)`
						: null}
				>
					<Walls />
					<Path />
				</g>
			{/if}
		</svg>
	{/if}

	<Overlay {start} {reset} {solve} />

	{#if mobile}
		<KeysMobile />
	{:else}
		<div class="below" style:width={`${$mazeSize}px`}>
			<div class="buttons">
				<button
					class="start"
					class:bounce={!$started && !$mq.reducedMotion}
					on:click={$gameState === "pre" ? start : reset}
				>
					{$gameState === "pre" ? "start" : "restart"} maze
				</button>
				<button class="solve" on:click={solve}>Complete maze</button>
			</div>

			<KeysDesktop />
		</div>
	{/if}
</div>

<style>
	.maze-container {
		display: flex;
		width: 100%;
		flex-direction: column;
		align-items: center;
		position: relative;
	}
	.below {
		margin-top: 1rem;
		display: flex;
		justify-content: space-between;
	}
	.buttons {
		display: flex;
		flex-direction: column;
		align-items: start;
	}
	button.start {
		font-size: 1.2rem;
		color: white;
		background-color: var(--color-accent-orange);
		text-transform: uppercase;
		font-weight: bold;
		font-family: var(--sans);
		padding: 0.9rem 0.75rem;
		transition: translate 0.5s linear;
	}
	button.start:hover {
		transform: translate(0, -2px);
	}
	button.solve {
		background: none;
		padding: 0;
		margin-top: 0.5rem;
		font-size: 0.9rem;
		font-family: var(--sans);
		color: var(--color-dark-tan);
		transition: translate 0.5s linear;
	}
	button.solve:hover {
		border-bottom: 2px solid var(--color-dark-tan);
	}
	button.reset {
		background: var(--color-accent-orange);
		padding: 0;
		font-size: 0.9rem;
		margin-top: 0.25rem;
		font-family: var(--mono);
		color: var(--color-dark-tan);
		transition: translate 0.5s linear;
	}
	.bounce {
		animation: bounce 0.7s ease-in-out infinite;
	}
	@keyframes bounce {
		0% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-3px);
		}
		100% {
			transform: translateY(0);
		}
	}

	@media (max-width: 700px) {
		.maze-container {
			max-width: 350px;
		}
		button.start {
			font-size: var(--14px);
			padding: 0.75rem 0.5rem;
		}
		button.solve {
			font-size: var(--12px);
		}
	}
</style>
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/components/Maze/Overlay.svelte">
```svelte
<script>
	import stateData from "$data/states.csv";
	import { getContext } from "svelte";
	import { selectedState } from "$stores/misc.js";
	import checkIcon from "$svg/check-orange.svg";
	import viewport from "$stores/viewport.js";
	import _ from "lodash";

	export let start;
	export let reset;
	export let solve;

	const { getMazeSize, getGameState, getUserSolved } = getContext("maze");
	const mazeSize = getMazeSize();
	const gameState = getGameState();
	const userSolved = getUserSolved();

	$: mobile = $viewport.width < 600;
	$: state = stateData.find((d) => d.id === $selectedState);
	$: stateName = state ? _.startCase(state.name) : "";
	$: guttmacherLink = state?.guttmacher;
</script>

<div
	class="overlay"
	style:height={`${$mazeSize}px`}
	class:visible={mobile || $gameState === "post"}
>
	{#if $gameState === "pre"}
		<button class="start" on:click={start}>start maze</button>
		<div class="instruction">Tap arrow buttons to navigate</div>
	{:else if $gameState === "post"}
		{#if $userSolved}
			<div class="complete">
				<span class="icon">{@html checkIcon}</span>
				<span class="text">Maze completed!</span>
			</div>
		{/if}
		{#if stateName == "District Of Columbia"}
			<p>Read more about the 
				<a href={guttmacherLink} target="_blank" class="link">District of Columbia's</a>
			abortion policies</p>
		{:else}
			<p>Read more about
				<a href={guttmacherLink} target="_blank" class="link">{stateName}'s</a>
			abortion policies</p>
		{/if}
		<button class="link link-sm" on:click={() => ($selectedState = undefined)}
			>Return to all mazes</button
		>
	{/if}

	{#if mobile && $gameState !== "pre"}
		<button class="reset" on:click={reset}>restart</button>
		<button class="solve" on:click={solve}>Complete</button>
	{/if}
</div>

<style>
	.overlay {
		width: 100%;
		position: absolute;
		top: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		opacity: 0;
		transition: opacity calc(var(--1s) * 0.3);
	}
	.overlay.visible {
		opacity: 1;
	}
	.overlay p {
		text-align: center;
	}
	.icon {
		display: flex;
		height: 50px;
		width: 50px;
		border-radius: 50%;
		background-color: var(--color-bg);
	}
	.instruction {
		margin-top: 0.5rem;
		font-size: 0.9rem;
	}
	button.start {
		font-size: 1.2rem;
		color: white;
		background: var(--color-accent-orange);
		text-transform: uppercase;
		font-weight: bold;
		font-family: var(--mono);
		padding: 0.9rem 0.75rem;
	}
	button.reset,
	button.solve {
		position: absolute;
		background: none;
		border: 1px solid var(--color-tan);
		color: var(--color-dark-tan);
		font-size: 0.8rem;
	}
	button.reset {
		top: 0;
		left: 0;
		transform: translate(0, -120%);
		background: var(--color-accent-orange);
		border: none;
		color: var(--color-bg);
		font-weight: 700;
		text-transform: uppercase;
	}
	button.solve {
		bottom: 0;
		right: 0;
		transform: translate(0, 120%);
	}
	button.reset:hover {
		transform: translate(0, -123%);
	}
	button.solve:hover {
		transform: translate(0, 117%);
	}
	button.start:hover {
		transform: translate(0, -2px);
	}
	.complete {
		font-size: var(--28px);
		font-weight: bold;
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}
	.link {
		background: none;
		color: var(--color-fg);
		padding: 0;
		margin: 0.5rem 0;
		font-weight: bold;
		font-size: 1.1rem;
		text-align: center;
		text-decoration: underline;
		border-bottom: none;
	}
	.link-sm {
		font-size: var(--14px);
	}
	.link:hover {
		color: var(--color-dark-tan);
	}

	@media (max-width: 700px) {
		.link-sm {
			font-size: var(--12px);
		}
		.icon {
			height: 36px;
			width: 36px;
		}
	}
</style>
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/components/Maze/Path.svelte">
```svelte
<script>
	import { getContext } from "svelte";
	import mq from "$stores/mq.js";
	import { tweened } from "svelte/motion";
	import { draw } from "svelte/transition";
	import { quintOut } from "svelte/easing";

	const {
		getData,
		getCellSize,
		getLocation,
		getPath,
		getWallWidth,
		getGameState
	} = getContext("maze");
	const data = getData();
	const cellSize = getCellSize();
	const location = getLocation();
	const path = getPath();
	const wallWidth = getWallWidth();
	const gameState = getGameState();

	let pathStr;
	let animatedPathStr;
	let inProgress = { x: false, y: false };
	const dur = 100;
	const circleX = tweened(($cellSize + $wallWidth) / 2);
	const circleY = tweened(($cellSize + $wallWidth) / 2);

	$: pathStrokeWidth = $cellSize * 0.25;
	$: if ($location.row === 0 && $location.col === 0) {
		$path = [{ row: 0, col: 0 }];
		animatedPathStr = "";
	}
	$: currentCenterX = $location.col * $cellSize + ($cellSize + $wallWidth) / 2;
	$: currentCenterY = $location.row * $cellSize + ($cellSize + $wallWidth) / 2;
	$: moveImmedietly =
		$gameState === "post" ||
		($location.col === 0 && $location.row === 0) ||
		$mq.reducedMotion;
	$: {
		circleX
			.set(currentCenterX, { duration: moveImmedietly ? 0 : dur })
			.then(() => {
				inProgress.x = false;
			});
		circleY
			.set(currentCenterY, { duration: moveImmedietly ? 0 : dur })
			.then(() => {
				inProgress.y = false;
			});
	}

	$: $path, $cellSize, $wallWidth, updatePath();
	const updatePath = () => {
		pathStr = $path
			.slice(0, $gameState === "post" ? $path.length : $path.length - 1)
			.reduce((acc, { row, col }, i) => {
				if (i === 0) {
					return acc;
				}

				const prev = $path[i - 1];
				const [prevRow, prevCol] = [prev.row, prev.col];
				const [rowDiff, colDiff] = [row - prevRow, col - prevCol];

				if (rowDiff === 1) {
					return `${acc} v ${$cellSize}`;
				} else if (rowDiff === -1) {
					return `${acc} v -${$cellSize}`;
				} else if (colDiff === 1) {
					return `${acc} h ${$cellSize}`;
				} else if (colDiff === -1) {
					return `${acc} h -${$cellSize}`;
				}
			}, `M ${($cellSize + $wallWidth) / 2} ${($cellSize + $wallWidth) / 2}`);

		let mostRecentMove = "";
		if ($path.length > 1) {
			const prev = $path[$path.length - 2];
			const [prevRow, prevCol] = [prev.row, prev.col];
			const [rowDiff, colDiff] = [
				$location.row - prevRow,
				$location.col - prevCol
			];
			let prevCenterX = prevCol * $cellSize + ($cellSize + $wallWidth) / 2;
			let prevCenterY = prevRow * $cellSize + ($cellSize + $wallWidth) / 2;

			const twoAgo = $path.length > 2 ? $path[$path.length - 3] : null;
			const doubleBack =
				twoAgo && twoAgo.row === $location.row && twoAgo.col === $location.col;

			if (rowDiff === 1) {
				mostRecentMove = `v ${$cellSize}`;
				if ((prevRow !== 0 || prevCol !== 0) && !doubleBack)
					prevCenterY -= pathStrokeWidth / 2;
			} else if (rowDiff === -1) {
				mostRecentMove = `v -${$cellSize}`;
				if ((prevRow !== 0 || prevCol !== 0) && !doubleBack)
					prevCenterY += pathStrokeWidth / 2;
			} else if (colDiff === 1) {
				mostRecentMove = `h ${$cellSize}`;
				if ((prevRow !== 0 || prevCol !== 0) && !doubleBack)
					prevCenterX -= pathStrokeWidth / 2;
			} else if (colDiff === -1) {
				mostRecentMove = `h -${$cellSize}`;
				if ((prevRow !== 0 || prevCol !== 0) && !doubleBack)
					prevCenterX += pathStrokeWidth / 2;
			}

			animatedPathStr = `M ${prevCenterX} ${prevCenterY} ${mostRecentMove}`;
		}
	};

	const onKeyDown = async (e) => {
		if (
			$gameState === "mid" &&
			(e.keyCode === 37 ||
				e.keyCode === 38 ||
				e.keyCode === 39 ||
				e.keyCode === 40)
		)
			e.preventDefault(); // Prevent modal from scrolling

		if ($gameState === "post" || $gameState === "pre") return;
		if (inProgress.x || inProgress.y) {
			circleX.set(currentCenterX, { duration: 0 });
			circleY.set(currentCenterY, { duration: 0 });
			move(e);
		} else {
			move(e);
		}
	};

	const move = (e) => {
		const current = $data.find(
			(d) => d.row === $location.row && d.col === $location.col
		);
		const [top, right, bottom, left] = current.walls;

		const validLeft = e.keyCode === 37 && !left;
		const validRight = e.keyCode === 39 && !right;
		const validUp = e.keyCode === 38 && !top;
		const validDown = e.keyCode === 40 && !bottom;

		if (validLeft || validRight || validUp || validDown) {
			inProgress = { x: true, y: true };
			if (validLeft) {
				$location = { row: $location.row, col: $location.col - 1 };
			} else if (validUp) {
				$location = { row: $location.row - 1, col: $location.col };
			} else if (validRight) {
				$location = { row: $location.row, col: $location.col + 1 };
			} else if (validDown) {
				$location = { row: $location.row + 1, col: $location.col };
			}
			$path = [...$path, $location];
		}
	};
</script>

<svelte:window on:keydown={onKeyDown} />
<g class="path" class:fade={$gameState !== "mid"}>
	<circle cx={$circleX} cy={$circleY} r={$cellSize / 4} />

	<path
		class="full"
		d={pathStr}
		style={`--stroke-width: ${pathStrokeWidth}px`}
	/>

	{#key animatedPathStr}
		<path
			class="animated"
			d={animatedPathStr}
			in:draw={{ duration: dur * 2, easing: quintOut }}
			style={`--stroke-width: ${pathStrokeWidth}px`}
		/>
	{/key}
</g>

<style>
	circle {
		fill: var(--color-accent-purple);
	}
	path.full {
		stroke: var(--color-accent-purple);
		stroke-width: var(--stroke-width);
		fill: none;
		transition: opacity calc(var(--1s) * 0.3);
	}
	.path.fade {
		opacity: 0.05;
	}
	path.animated {
		stroke: var(--color-accent-purple);
		stroke-width: var(--stroke-width);
		fill: none;
	}
</style>
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/components/Maze/Walls.svelte">
```svelte
<script>
	import { getContext } from "svelte";
	import { draw } from "svelte/transition";
	import mq from "$stores/mq.js";

	const {
		animated,
		getData,
		getCellSize,
		getWallWidth,
		getPadding,
		getGameState,
		getDims
	} = getContext("maze");
	const data = getData();
	const cellSize = getCellSize();
	const wallWidth = getWallWidth();
	const dims = getDims();
	const padding = getPadding();
	const gameState = getGameState();
</script>

<g
	style:transform={`translate(${$padding}px, ${$padding}px)`}
	class:fade={$gameState !== "mid"}
>
	{#each $data as { row, col, walls }}
		{@const [top, right, bottom, left] = walls}
		{@const movement = animated && !$mq.reducedMotion}
		{@const lineDraw = {
			duration: movement ? 800 : 0,
			delay: movement ? Math.random() * 400 : 0
		}}
		{#if top && (row !== 0 || col !== 0)}
			<line
				x1={col * $cellSize - $wallWidth / 2}
				x2={col * $cellSize + $cellSize + $wallWidth / 2}
				y1={row * $cellSize}
				y2={row * $cellSize}
				stroke-width={$wallWidth}
				transition:draw={lineDraw}
			/>
		{/if}

		{#if right}
			<line
				x1={col * $cellSize + $cellSize}
				x2={col * $cellSize + $cellSize}
				y1={row * $cellSize - $wallWidth / 2}
				y2={row * $cellSize + $cellSize + $wallWidth / 2}
				stroke-width={$wallWidth}
				transition:draw={lineDraw}
			/>
		{/if}

		{#if bottom && (row !== $dims - 1 || col !== $dims - 1)}
			<line
				x1={col * $cellSize + $cellSize + $wallWidth / 2}
				x2={col * $cellSize - $wallWidth / 2}
				y1={row * $cellSize + $cellSize}
				y2={row * $cellSize + $cellSize}
				stroke-width={$wallWidth}
				transition:draw={lineDraw}
			/>
		{/if}

		{#if left}
			<line
				x1={col * $cellSize}
				x2={col * $cellSize}
				y1={row * $cellSize + $cellSize + $wallWidth / 2}
				y2={row * $cellSize - $wallWidth / 2}
				stroke-width={$wallWidth}
				transition:draw={lineDraw}
			/>
		{/if}
	{/each}
</g>

<style>
	g {
		transition: opacity calc(var(--1s) * 0.5);
	}
	g.fade {
		opacity: 0.05;
	}
	line {
		stroke: var(--color-dark-tan);
	}
	rect {
		fill: none;
		stroke: none;
	}
	rect.start {
		opacity: 0.2;
	}
	rect.finish {
		opacity: 0.5;
	}
</style>
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/components/Methodology.svelte">
```svelte
<script>
	import sources from "$data/sources.csv";
	import viewport from "$stores/viewport.js";
	import activityBook from "$svg/activity-book.svg";
	import { base } from "$app/paths";

	export let title;
	export let content;

	const downloadPdf = () => {
		document.getElementById("pdf-link").click();
	};

	$: mobile = $viewport.width < 600;
</script>

<div class="inner">
	<button class="activity" on:click={downloadPdf}>
		<img class="book-img" src="{base}/assets/activity_book.jpg" alt="the front cover of the abortion maze activity book" />
		<div>Download an activity book of all the state mazes.</div>
		<a
			href={`${base}/assets/AbortionMazeBook_ThePudding.pdf`}
			download
			id="pdf-link"
			style="display:none">download pdf</a
		>
	</button>

	<h4>{title}</h4>
	{#each content as { type, value }}
		<p>{@html value}</p>
	{/each}

	<details>
		<summary>
			<h4 class="sources">Sources</h4>
		</summary>

		<table>
			<thead>
				<tr>
					<th>Metric</th>
					<th>Last Updated</th>
				</tr>
			</thead>
			<tbody>
				{#each sources as { source, metric, lastUpdated, link }, i}
					<tr>
						<td
							><span>{i + 1}</span><a href={link} target="_blank">{metric}</a
							></td
						>
						<td>{mobile ? "Last updated: " : ""}{lastUpdated}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</details>
</div>

<style>
	:global(#methodology) {
		display: flex;
		background: var(--color-tan);
		min-height: 100vh;
		padding: 0 1rem;
		position: relative;
	}
	.inner {
		max-width: 700px;
		margin: 8rem auto;
		padding: 0 0 2rem 0;
	}
	h4 {
		font-family: var(--serif);
		font-size: var(--24px);
		font-weight: 700;
		color: var(--color-fg);
	}
	h4.sources {
		display: inline-block;
		margin: 1rem 0 0 0.25rem;
		transform: translateY(3px);
	}
	summary {
		cursor: pointer;
	}
	details {
		margin-bottom: 2rem;
	}
	p {
		color: var(--color-fg);
		line-height: 1.5;
		font-size: var(--16px);
	}
	.activity {
		background: #dfd8ff;
		margin: 0 auto 5rem auto;
		padding: 1rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 320px;
		transform: translateY(0);
		transition: transform calc(var(--1s) * 0.2) ease-out;
		border-radius: 3px;
		position: relative;
	}
	.book-img {
		width: 80px;
		position: absolute;
		left: -0.35rem;
		transform: rotate(-2deg);
		border: 1px solid var(--color-accent-purple);
		border-radius: 3px;
		transition: transform calc(var(--1s) * 0.2) ease-out;
	}
	.activity div {
		color: var(--color-fg);
		text-align: left;
		font-weight: bold;
		padding-left: 75px;
	}
	.activity:hover {
		transform: translateY(-5px);
	}
	.activity:hover div {
		color: var(--color-accent-purple);
	}

	.activity:hover .book-img {
		color: var(--color-accent-purple);
		transform: rotate(2deg);
	}
	:global(#methodology a) {
		color: var(--color-fg);
	}
	:global(#methodology a:hover) {
		color: var(--color-dark-tan);
	}
	table {
		table-layout: auto;
		margin-top: 1rem;
		font-size: var(--12px);
	}
	thead {
		border-bottom: 3px solid var(--color-fg);
		text-transform: uppercase;
	}
	td,
	th {
		padding: 6px;
	}
	td {
		border-bottom: 1px solid var(--color-medium-tan);
		padding: 0.75rem 0;
	}
	td a {
		border-bottom: none;
		text-decoration: underline;
	}
	td span {
		margin: 0 0.5rem 0 0;
	}
	td:nth-child(2),
	td:nth-child(3) {
		white-space: nowrap;
	}

	@media (max-width: 600px) {
		:global(#methodology) {
			height: auto;
		}

		thead {
			display: none;
		}

		tr {
			display: flex;
			flex-direction: column;
			border-bottom: 1px solid #ddd;
			padding: 0.5rem;
			border-bottom: 1px solid var(--color-medium-tan);
		}
		td {
			display: flex;
			justify-content: start;
			padding: 0;
			border: none;
		}
		td span {
			display: none;
		}
		td::before {
			content: attr(data-label); /* Adds label for accessibility */
			font-weight: bold;
		}
	}

	@media (max-width: 400px) {
		.activity {
			width: 260px;
		}
		.activity div {
			font-size: var(--12px);
		}
		.activity .book-img {
			width: 70px;
		}
	}
</style>
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/components/Modal/Contents.svelte">
```svelte
<script>
	import Info from "$components/Modal/Info.svelte";
	import Maze from "$components/Maze/Maze.svelte";
	import loadMazeData from "$utils/loadMazeData.js";
	import stateData from "$data/states.csv";
	import { selectedState } from "$stores/misc.js";
	import viewport from "$stores/viewport.js";
	import _ from "lodash";
	import { tick } from "svelte";
	import Icon from "$components/helpers/Icon.svelte";

	export let sentences;

	let data;
	let width;
	let height;
	let loading = false;

	$: availableSpace = Math.min(height, width);
	$: numCells = data && data.length ? Math.sqrt(data.length) : 0;
	$: if ($selectedState) getMazeData();
	$: mobile = $viewport.width < 700;
	$: state = stateData.find((d) => d.id === $selectedState);
	$: guttmacherLink = state?.guttmacher;

	let t;
	let copySuccess = false;

	const getMazeData = async () => {
		loading = true;
		data = await loadMazeData($selectedState);
		await tick();
		loading = false;
	};

	const share = () => {
		const baseUrl = window.location.origin + window.location.pathname;
		const shareUrl = `${baseUrl}?state=${encodeURIComponent($selectedState)}`;

		navigator.clipboard
			.writeText(shareUrl)
			.then(() => {
				clearTimeout(t);
				copySuccess = true;

				t = setTimeout(() => {
					copySuccess = false;
				}, 2000);
			})
			.catch((err) => {});
	};
</script>

<div class="contents">
	<div class="top-wrapper">
		<div class="info">
			{#if $selectedState}
				<Info {sentences} />
			{/if}
		</div>
		<div class="maze" bind:clientWidth={width} bind:clientHeight={height}>
			{#if $selectedState}
				<Maze
					{availableSpace}
					wallData={data}
					{numCells}
					animated={false}
					{loading}
				/>
			{/if}
		</div>
	</div>
	{#if !mobile}
		<div class="learn">
			<span>Learn more about this</span>
			<a href={guttmacherLink} target="_blank">state’s abortion policies</a>
			and
			<span class="share">
				<a href="#" on:click|preventDefault={share}>share this state’s maze</a>
				<span class="icon"><Icon name="share" /></span>
				<span class="clipboard" class:visible={copySuccess}>Link copied!</span>
			</span>
		</div>
	{/if}
</div>

<style>
	.contents {
		display: flex;
		width: 100%;
		flex-direction: column;
		height: 100%;
		gap: 3rem;
	}
	.top-wrapper {
		width: 100%;
		display: flex;
		justify-content: space-between;
		flex-direction: row;
	}
	.info {
		width: calc(50% - 1rem);
	}
	.maze {
		width: calc(50% - 1rem);
		display: flex;
		align-items: start;
		margin-top: 4rem;
		justify-content: center;
		aspect-ratio: 1 / 1.25;
	}

	.learn {
		display: flex;
		flex-wrap: wrap;
		gap: 0 4px;
		align-items: baseline;
		color: var(--color-dark-tan);
		font-size: 0.9rem;
		width: 100%;
		z-index: 1000;
	}
	.share {
		display: flex;
		align-items: center;
		position: relative;
	}
	.share .icon {
		display: flex;
		height: 20px;
		width: 20px;
		margin-left: 6px;
	}

	:global(
			.share:hover .icon svg path,
			.share:hover .icon svg polyline,
			.share:hover .icon svg line
		) {
		stroke: var(--color-fg);
	}

	.clipboard {
		font-size: var(--12px);
		font-family: var(--sans);
		font-weight: 600;
		position: absolute;
		top: 0;
		left: 50%;
		width: 100px;
		opacity: 0;
		transform: translate(-52.75%, 0);
		z-index: -1000;
		text-align: center;
		background: var(--color-bg);
		border: 1px solid var(--color-dark-tan);
		color: var(--color-fg);
		padding: 0.25rem;
		border-radius: 3px;
		transition: transform calc(var(--1s) * 0.3), opacity calc(var(--1s) * 0.15);
	}
	.clipboard.visible {
		transform: translate(-52.75%, -120%);
		opacity: 1;
	}

	@media (max-width: 700px) {
		.contents {
			align-items: center;
		}
		.top-wrapper {
			flex-direction: column;
			align-items: center;
		}
		.info,
		.maze {
			width: 100%;
		}
		.maze {
			margin-top: 1rem;
			align-items: center;
		}
	}

	@media (max-width: 600px) {
		.contents {
			flex-direction: column;
			align-items: center;
			gap: 1rem;
		}
		.info,
		.maze {
			width: 100%;
		}
		.maze {
			flex: 1;
			max-width: 80%;
		}
		.top-wrapper {
			height: 100%;
		}
	}
</style>
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/components/Modal/Facts.svelte">
```svelte
<script>
	import _ from "lodash";
	import { scaleLinear } from "d3-scale";
	import {
		globalGameState,
		pathLength,
		currentMazeSize
	} from "$stores/misc.js";
	import viewport from "$stores/viewport.js";

	export let facts;

	let containerHeight;
	let factEls = [];
	let currentFact = 0;

	const getZIndex = (i, currentFact) => {
		const distance = Math.abs(i - currentFact);
		return facts.length - distance;
	};
	const cycleFact = () => {
		if (currentFact < facts.length - 1) {
			currentFact = currentFact + 1;
		}
	};

	function onFactMouse(event, currZIndex, visible) {
		if (visible) {
			event.target.style.zIndex = 100;
		}
	}

	function onFactLeave(event, currZIndex, visible) {
		if (visible) {
			event.target.style.zIndex = currZIndex;
		}
	}

	$: if ($globalGameState === "pre" || $pathLength === 0) currentFact = 0;
	$: if ($globalGameState === "mid" && $pathLength % steps === steps - 1)
		cycleFact();
	$: if ($globalGameState === "post") currentFact = facts.length - 1;
	$: mobile = $viewport.width < 700;
	$: steps = $currentMazeSize <= 10 ? 2 : 5;
	$: heights = factEls.map((d) => d.getBoundingClientRect().height);
	$: maxFactHeight = _.max(heights);
	$: combinedFactHeight = _.sum(heights);
	$: topScale = scaleLinear()
		.domain([0, combinedFactHeight - heights[heights.length - 1]])
		.range([0, containerHeight - heights[heights.length - 1]]);
</script>

<div
	class="facts"
	style:height={mobile ? `${maxFactHeight}px` : null}
	bind:clientHeight={containerHeight}
>
	{#each facts as { fact }, i}
		{@const plentyOfRoom = containerHeight > combinedFactHeight}
		{@const heightAbove = _.sum(
			_.slice(
				factEls.map((d) => d.clientHeight),
				0,
				i
			)
		)}
		{@const top =
			i === 0
				? 0
				: plentyOfRoom
				? heightAbove - 20
				: topScale(_.sum(_.slice(heights, 0, i)))}
		<div
			bind:this={factEls[i]}
			on:mouseover={(e) =>
				onFactMouse(e, getZIndex(i, currentFact), currentFact >= i)}
			on:mouseleave={(e) =>
				onFactLeave(e, getZIndex(i, currentFact), currentFact >= i)}
			class="fact"
			class:above={i < currentFact}
			class:below={i > currentFact}
			class:disabled={$globalGameState === "pre"}
			class:fade={$globalGameState === "pre" || currentFact !== i}
			class:visible={currentFact >= i}
			style:top={`${top}px`}
			style:z-index={getZIndex(i, currentFact)}
		>
			{@html fact}
		</div>
	{/each}
</div>

<style>
	.facts {
		position: relative;
		height: 100%;
		width: 100%;
	}
	.fact {
		position: absolute;
		width: 100%;
		background: var(--color-bg);
		border: 1px solid var(--color-dark-tan);
		border-radius: 3px;
		padding: 1rem;
		opacity: 0;
		cursor: pointer;
		transform: translateY(20px);
		transition: transform calc(var(--1s) * 0.3), color calc(var(--1s) * 0.3),
			border calc(var(--1s) * 0.3), opacity calc(var(--1s) * 0.3),
			z-index calc(var(--1s) * 0.3);
	}
	.visible {
		opacity: 1;
		transform: translateY(0);
	}
	.fact:hover {
		color: var(--color-fg);
		border: 1px solid var(--color-dark-tan);
	}
	.fade {
		color: rgba(28, 18, 70, 0.1);
		border: 1px solid rgba(176, 163, 128, 0.3);
	}
	.fade.above:hover {
		transform: translateY(-5px);
	}
	.fade.below:hover {
		transform: translateY(5px);
	}
	.fact.disabled {
		pointer-events: none;
	}

	@media (max-width: 700px) {
		.facts {
			/* min-height: 200px; */
			/* padding-bottom: 2rem; */
		}
		.fact {
			padding: 0.5rem;
			font-size: 0.9rem;
		}
	}
</style>
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/components/Modal/Info.svelte">
```svelte
<script>
	import Facts from "$components/Modal/Facts.svelte";
	import { selectedState } from "$stores/misc.js";
	import stateData from "$data/states.csv";
	import factsData from "$data/facts.csv";
	import _ from "lodash";
	import shareIcon from "$svg/share.svg";
	import plusIcon from "$svg/plus-light.svg";
	import viewport from "$stores/viewport.js";
	import Icon from "$components/helpers/Icon.svelte";

	export let sentences;

	const { complexitySentences, banSentences } = sentences;

	let t;
	let copySuccess = false;

	const share = () => {
		const baseUrl = window.location.origin + window.location.pathname;
		const shareUrl = `${baseUrl}?state=${encodeURIComponent($selectedState)}`;

		navigator.clipboard
			.writeText(shareUrl)
			.then(() => {
				clearTimeout(t);
				copySuccess = true;

				t = setTimeout(() => {
					copySuccess = false;
				}, 2000);
			})
			.catch((err) => {});
	};

	$: mobile = $viewport.width < 700;
	$: state = stateData.find((d) => d.id === $selectedState);
	$: name = mobile && state.id === "dc" ? "D.C." : _.startCase(state.name);
	$: story = state.story;
	$: complexity = state.complexity;
	$: complexityText =
		complexity === "most" || complexity === "least"
			? complexitySentences[0].value.replace("[COMPLEXITY]", complexity)
			: complexitySentences[1].value.replace("[COMPLEXITY]", complexity);
	$: ban = state.ban;
	$: banText =
		ban === "no restriction"
			? banSentences[0].value
			: ban === "banned"
			? banSentences[2].value
			: banSentences[1].value.replace("[LIMIT]", ban);
	$: facts = factsData
		.filter((d) => d.id === $selectedState)
		.map((d) => {
			if (!story) return d;
			return {
				...d,
				fact: d.fact.replaceAll("NAME", _.startCase(story))
			};
		});
</script>

<div class="info">
	<div class="header">
		<div class="title">
			<h2>
				{name}
			</h2>
			{#if story}
				<div class="story">
					<span class="plus-icon">{@html plusIcon}</span>
					{_.startCase(story)}'s story
				</div>
			{/if}

			{#if mobile}
				<span class="share-icon" on:click|preventDefault={share}
					><Icon name="share" stroke="#726D68" width="1.25rem" />
					<span class="clipboard" class:visible={copySuccess}>Link copied!</span
					>
				</span>
			{/if}
		</div>

		<div class="classification">
			{@html complexityText}
			{@html banText}
		</div>
	</div>

	<Facts {facts} />
</div>

<style>
	.info {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: 1.5rem;
		height: 100%;
	}
	.title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	h2 {
		font-family: var(--serif);
		font-weight: bold;
		font-size: 3rem;
		display: flex;
		align-items: center;
		margin: 0;
	}
	.story {
		background: var(--color-accent-purple);
		color: var(--color-bg);
		border-radius: 3px;
		padding: 6px 8px;
		font-weight: bold;
		display: flex;
		align-items: center;
		white-space: nowrap;
	}
	.learn {
		display: flex;
		flex-wrap: wrap;
		gap: 0 4px;
		align-items: baseline;
		color: var(--color-tan);
		font-size: 0.9rem;
		z-index: 1000;
	}
	.share {
		display: flex;
		align-items: center;
		position: relative;
	}
	.share-icon {
		position: relative;
		display: flex;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		height: 20px;
		width: 20px;
		margin-left: 6px;
	}
	.plus-icon {
		display: flex;
		height: 16px;
		width: 16px;
		margin-right: 6px;
	}
	a {
		line-height: 1;
	}
	span,
	a {
		white-space: nowrap;
	}
	.clipboard {
		font-size: var(--12px);
		font-family: var(--sans);
		font-weight: 600;
		position: absolute;
		top: 0;
		left: 50%;
		width: 100px;
		opacity: 0;
		transform: translate(-50%, 0);
		z-index: -1000;
		text-align: center;
		background: var(--color-bg);
		border: 1px solid var(--color-dark-tan);
		color: var(--color-fg);
		padding: 0.25rem;
		border-radius: 3px;
		transition: transform calc(var(--1s) * 0.3), opacity calc(var(--1s) * 0.15);
	}
	.clipboard.visible {
		transform: translate(-50%, -110%);
		opacity: 1;
	}

	:global(
			h2 .icon:hover svg path,
			h2 .icon:hover svg polyline,
			h2 .icon:hover svg line
		) {
		stroke: var(--color-fg);
	}
	:global(
			.share:hover .icon svg path,
			.share:hover .icon svg polyline,
			.share:hover .icon svg line
		) {
		stroke: var(--color-fg);
	}

	@media (max-width: 700px) {
		.header {
			width: calc(100% - 2rem);
		}
		.title {
			margin-bottom: 0.5rem;
		}
		h2 {
			font-size: 2rem;
			margin: 0;
		}
		.story {
			font-size: 0.8rem;
		}
		.plus-icon {
			height: 12px;
			width: 12px;
		}
		.share-icon {
			background: var(--color-tan);
			width: 36px;
			height: 36px;
			border-radius: 50%;
			display: flex;
		}
		:global(
				.share-icon svg path,
				.share-icon svg polyline,
				.share-icon svg line
			) {
			stroke: var(--color-fg);
		}
		.share-icon:hover {
			background: var(--color-dark-tan);
			cursor: pointer;
		}
		.classification {
			font-size: 0.9rem;
		}
		.info {
			gap: 0.5rem;
		}
	}

	@media (max-width: 600px) {
		.clipboard.visible {
			transform: translate(-50%, -50%);
			z-index: 100;
		}
	}

	@media (max-width: 500px) {
		h2 {
			font-size: 1.75rem;
		}
	}
</style>
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/components/Modal/Modal.svelte">
```svelte
<script>
	import Contents from "$components/Modal/Contents.svelte";
	import Icon from "$components/helpers/Icon.svelte";
	import { selectedState, globalGameState } from "$stores/misc.js";
	import { browser } from "$app/environment";
	import { tick } from "svelte";
	import states from "$data/states.csv";
	import viewport from "$stores/viewport.js";

	export let sentences;

	let modalEl;
	let stateEl;
	let numFocusable;
	let firstFocusable;
	let lastFocusable;

	$: open = $selectedState !== undefined;
	$: ban =
		$selectedState &&
		states.find((d) => d.id === $selectedState).ban === "true";
	$: if (browser) document.body.classList.toggle("noscroll", open);
	$: if (open && modalEl) focusModal();
	$: if (!open && stateEl) focusState();
	$: mobile = $viewport.width < 600;
	$: mobile, $globalGameState, getFocusable();

	const focusModal = async () => {
		await tick();
		await getFocusable();
		modalEl.focus();
		stateEl = document.querySelector(`.state#${$selectedState}`);
	};
	const focusState = () => {
		stateEl.focus();
		stateEl = undefined;
	};
	const close = () => {
		$selectedState = undefined;
	};
	const trapFocus = (e) => {
		const tabPressed = e.key === "Tab" || e.keyCode === 9;
		if (!tabPressed) return;

		if (e.shiftKey) {
			if (document.activeElement === firstFocusable) {
				lastFocusable.focus();
				e.preventDefault();
			}
		} else {
			if (document.activeElement === lastFocusable) {
				firstFocusable.focus();
				e.preventDefault();
			}
		}
	};
	const getFocusable = async () => {
		if (!modalEl) return;

		await tick();
		const focusable = Array.from(
			modalEl.querySelectorAll(
				"a[href], button, textarea, input[type='text'], input[type='radio'], input[type='checkbox'], select"
			)
		).filter((d) => !d.disabled);

		numFocusable = focusable.length;
		firstFocusable = focusable[0];
		lastFocusable = focusable[numFocusable - 1];
	};
</script>

<div
	role="dialog"
 aria-label="State maze — historical snapshot, October 17, 2024"
 aria-modal={open}
 class="modal"
	class:open
	class:ban
	bind:this={modalEl}
	tabindex="-1"
	on:keydown={trapFocus}
>
	<button class="close" on:click={close} aria-label="close"
		><Icon name="x" /></button
	>
	<Contents {sentences} />
</div>

<style>

.modal::before{content:"原作快照 · 2024-10-17";position:absolute;top:14px;left:3rem;font:11px var(--sans);color:var(--color-dark-tan)}
	:global(body.noscroll) {
		overflow: hidden;
	}
	.modal {
		opacity: 0;
		z-index: -1000;
		transition: opacity calc(var(--1s) * 0.3);
		display: flex;
		flex-direction: column;
		position: fixed;
		width: 90%;
		max-width: 1000px;
		max-height: 90%;
		margin: auto;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: var(--color-bg);
		border: 1px solid var(--color-dark-tan);
		box-shadow: 0px 5px 10px rgba(232, 229, 225, 0.5);
		padding: 3rem;
	}
	.modal.open {
		z-index: 1002;
		opacity: 1;
	}
	.close {
		display: flex;
		border-radius: 100%;
		background: var(--color-tan);
		position: absolute;
		top: 0;
		right: 0;
		transform: translate(50%, -50%);
	}
	:global(.close svg line) {
		stroke: var(--color-fg);
	}
	.close:hover {
		background: var(--color-dark-tan);
	}

	@media (max-height: 830px) {
		.modal {
			overflow: scroll;
		}
		.close {
			transform: translate(-8px, 8px);
		}
	}

	@media (max-width: 800px) {
		.modal {
			padding: 2rem;
		}
	}

	@media (max-width: 700px) {
		.modal {
			width: calc(100% - 2rem);
			margin: 1rem;
			max-width: 500px;
		}
	}

	@media (max-width: 600px) {
		.modal {
			padding: 1.25rem;
			margin: 0;
			height: calc(100vh - 2rem);
			max-height: 98%;
		}
		.modal.open {
			display: flex;
			flex-direction: column;
			align-items: center;
		}
	}
@media(max-width:600px){.modal::before{top:4px;left:20px;font-size:10px}}
</style>
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/components/Pick.svelte">
```svelte
<script>
	import stateData from "$data/states.csv";
	import { selectedState } from "$stores/misc.js";
	import arrowDownIcon from "$svg/arrow-down.svg";
	import plusIcon from "$svg/plus.svg";
	import _ from "lodash";
	import mq from "$stores/mq.js";

	export let hed;
	export let sub;
	export let stories;
	export let directionsA;
	export let directionsB;

	const onClick = async (id) => {
		document
			.getElementById("dashboard")
			.scrollIntoView({ behavior: $mq.reducedMotion ? "instant" : "smooth" });
		setTimeout(() => {
			$selectedState = id;
		}, 800);
	};
	const seeAll = () => {
		document
			.getElementById("dashboard")
			.scrollIntoView({ behavior: $mq.reducedMotion ? "instant" : "smooth" });
	};
</script>

<div class="title" class:fade={$selectedState}>
	<h2>{@html hed}</h2>
	<p class="desc">{@html sub}</p>
	<div class="directions">
		<p>
			<span>{directionsA}</span>
			<span class="icon">{@html plusIcon}</span>
		</p>
		<p class="or">OR</p>
		<button class="sub" on:click={seeAll}>
			<span class="text">{directionsB}</span>
			<span class="icon">{@html arrowDownIcon}</span>
		</button>
	</div>
</div>

<div class="stories" class:fade={$selectedState}>
	{#each stories as { id, age }}
		{@const state = _.startCase(stateData.find((d) => d.id === id).name)}
		{@const name = _.startCase(stateData.find((d) => d.id === id).story)}
		<button class="story" on:click={() => onClick(id)}>
			<div class="img-wrapper">
				<div class="img-absolute img-bg" />
				<img
					class="img-absolute img-maze"
					src={`assets/img/states/${id}.png`}
					alt={`maze representing abortion restrictions in ${state}`}
				/>
				<img
					class="img-absolute img-person"
					src={`assets/img/stories/${name.toLowerCase()}.png`}
					alt={`a line art illustration of ${name}, a ${age}-year-old from ${state}`}
				/>
				<div class="plus-add">
					{@html plusIcon}
				</div>
			</div>
			<div class="name">{name}</div>
			<div class="info">{state}, {age}</div>
		</button>
	{/each}
</div>

<style>
	:global(#pick) {
		width: 100%;
		padding: 4rem 1rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		border-top: 1px solid var(--color-tan);
		border-bottom: 1px solid var(--color-tan);
		margin-bottom: 8rem;
	}
	.title,
	.stories {
		transition: opacity calc(var(--1s) * 0.3);
		max-width: 780px;
	}
	.fade {
		opacity: 0.2;
	}
	.title {
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	h2 {
		font-family: var(--serif);
		font-weight: 300;
		font-size: var(--36px);
		max-width: 40rem;
	}
	.desc {
		max-width: 30rem;
		font-size: var(--14px);
		margin: 0;
		font-style: italic;
	}
	.directions {
		display: flex;
		flex-direction: row;
		margin: 1rem 0;
		gap: 0.5rem;
	}
	.directions p {
		display: flex;
		flex-direction: row;
		align-items: center;
		font-size: var(--20px);
	}
	.directions .or {
		font-weight: 700;
		margin: 0 0.5rem;
		font-size: var(--14px);
	}
	.stories {
		width: 100%;
		display: flex;
		flex-direction: row;
		flex-wrap: wrap;
		gap: 1rem;
		align-items: center;
		justify-content: center;
	}
	.story {
		width: calc(33.33% - 1rem);
		max-width: 200px;
		background: none;
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.story:hover {
		cursor: pointer;
	}
	.img-wrapper {
		position: relative;
		width: 100%;
		aspect-ratio: 1;
		margin-bottom: 0.5rem;
	}
	.plus-add {
		position: absolute;
		top: calc(20% - 1rem);
		right: calc(10% - 1rem);
		height: 1.75rem;
		width: 1.75rem;
		border-radius: 50%;
		border: 2px solid var(--color-bg);
		z-index: 1000;
		background: var(--color-bg);
		opacity: 0;
		transition: opacity calc(var(--1s) * 0.2);
	}
	.img-absolute {
		position: absolute;
		bottom: 0;
		left: 0;
	}
	.img-bg {
		width: 80%;
		aspect-ratio: 1;
		left: 50%;
		transform: translate(-50%, 0);
		background-color: #dfd8ff;
		transition: background-color calc(var(--1s) * 0.2);
	}
	.story:hover .img-bg {
		cursor: pointer;
		background-color: #9181d4;
	}
	.story:hover .plus-add {
		opacity: 1;
	}
	.img-maze {
		width: 80%;
		left: 50%;
		bottom: 0;
		transform: translate(-50%, 0);
	}
	.img-person {
		width: 100%;
		max-width: none;
		left: 50%;
		bottom: -10.5%;
		transform: translate(-50%, 0);
	}
	.name {
		font-family: var(--serif);
		font-size: 2rem;
	}
	.sub {
		color: var(--color-fg);
		padding: 0;
		background: none;
		border-radius: 0;
		display: flex;
		align-items: center;
		font-size: var(--20px);
	}
	.sub:hover .text {
		color: var(--color-accent-purple);
	}
	:global(.sub:hover .icon svg path) {
		fill: var(--color-accent-purple);
	}
	:global(.sub:hover .icon) {
		transform: translateY(2px);
		transition: transform 100ms ease-out;
	}
	.text {
		text-decoration: underline;
	}
	.icon {
		height: 20px;
		width: 17px;
		margin-left: 4px;
		display: flex;
	}
	:global(.sub .icon svg path) {
		fill: var(--color-fg);
	}

	@media (max-width: 700px) {
		:global(#pick) {
			margin-bottom: 2rem;
		}
		h2 {
			font-size: var(--24px);
		}
		.desc {
			font-size: var(--12px);
		}
		.directions p,
		.sub {
			font-size: var(--16px);
		}
		.stories {
			gap: 0;
		}
		.story {
			width: 50%;
			padding: 0;
		}
	}
</style>
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/components/helpers/Icon.svelte">
```svelte
<script>
	import feather from "feather-icons";
	export const directions = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];

	export let name;
	export let direction = "n";
	export let width = "1.25em";
	export let height = "1.25em";
	export let strokeWidth = undefined;
	export let stroke = undefined;

	$: icon = feather.icons[name];
	$: rotation = directions.indexOf(direction) * 45;
	$: if (icon) {
		if (stroke) icon.attrs["stroke"] = stroke;
		if (strokeWidth) icon.attrs["stroke-width"] = strokeWidth;
	}
</script>

{#if icon}
	<svg
		{...icon.attrs}
		style="width: {width}; height: {height}; transform: rotate({rotation}deg);"
	>
		<g>
			{@html icon.contents}
		</g>
	</svg>
{/if}

<style>
	svg {
		width: 1em;
		height: 1em;
		overflow: visible;
		transform-origin: 50% 50%;
	}
</style>
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/components/helpers/Select.svelte">
```svelte
<script>
	export let options = [];
	export let label = "";
	export let disabled = false;
	export let value = options.length ? options[0].value : "";

	const id = `select-${Math.floor(Math.random() * 1000000)}`;
</script>

<div class="select">
	{#if label}
		<label for={id}>{label}</label>
	{/if}
	<select {id} bind:value {disabled}>
		{#each options as option}
			<option
				value={option.value}
				disabled={option.disabled !== undefined ? option.disabled : false}
				>{option.label}</option
			>
		{/each}
	</select>
</div>

<style>
	.select {
		position: relative;
		display: flex;
		align-items: center;
	}

	label {
		display: inline-block;
		font-family: inherit;
		font-weight: inherit;
		font-size: var(--12px);
		margin-right: 0.75em;
		text-align: right;
		text-transform: uppercase;
	}
	select {
		/* width: 100%; */
		height: 40px;
		font-family: inherit;
		font-size: var(--14px);
		cursor: pointer;
		background: var(--color-bg);
		color: var(--color-fg);
		border-radius: 3px;
		padding: 0.5em 2rem 0.5em 0.5em;
		appearance: none;
		line-height: 1.4;
	}
	/* select:nth-of-type(1) {
		width: 13.5rem;
	} */
	select::-ms-expand {
		display: none;
	}

	.select::after {
		display: block;
		content: "";
		position: absolute;
		bottom: 1.25em;
		right: 0.75em;
		width: 0.75em;
		height: 0.75em;
		z-index: 1;
		background: var(--color-fg);
		clip-path: polygon(0% 0%, 100% 100%, 0% 100%);
		border-radius: 1px;
		transform-origin: center center;
		transform: rotate(-45deg);
		pointer-events: none;
	}

	select:hover {
		outline: 1px solid var(--color-focus);
	}

	select:focus {
		box-shadow: 0 0 4px 0 var(--color-focus);
	}

	.select:disabled {
		cursor: not-allowed;
		background-color: var(--color-gray-300);
	}

	@media (max-width: 600px) {
		select {
			height: 32px;
		}
		.select::after {
			bottom: 1em;
			width: 0.75em;
			height: 0.75em;
			border-radius: 2px;
		}
	}

	@media (max-width: 500px) {
		label {
			width: 2.5rem;
			text-align: right;
		}
	}
</style>
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/data/copy.json">
```json
{"title":"The United States of Abortion Mazes","description":"To illustrate how difficult it is to get abortion care in the United States, we built a maze for each state where the difficulty is calculated by the state’s abortion policies.","url":"https://pudding.cool/2024/10/abortion-mazes","keywords":"abortion, maze, health, health care, reproductive rights, womens rights, bodily autonomy, roe v. wade, dobbs, supreme court, pregnancy","byline":"By <a href=https://pudding.cool/author/jan-diehm/ target=_blank>Jan Diehm</a> & <a href=https://pudding.cool/author/michelle-pera-mcghee/ target=_blank>Michelle Pera-McGhee</a>","body":[{"section":"intro","content":[{"type":"Scrollytelling","value":{"steps":[{"type":"text","value":"In 1973, <i>Roe v. Wade</i> granted a nationwide right to abortion and helped create a <strong>path to access.</strong>"},{"type":"text","value":"But, abortion access has <strong>rarely been a straight line</strong> — it’s full of twists, turns, and roadblocks."},{"type":"text","value":"And these barriers have only gotten more complicated since the US Supreme Court <strong>gave states the power to ban abortion</strong> in 2022’s <i>Dobbs</i> ruling."},{"type":"text","value":"While <strong>13 states completely outlawed abortion,</strong> with many additional states dismantling access in other ways…"},{"type":"text","value":"…other states have moved to strengthen their protections, creating a <strong>complicated patchwork of laws</strong> across the country."},{"type":"text","value":"To illustrate how difficult it is to get abortion care, <strong>we built a maze for each state</strong> where the difficulty is calculated by the state’s abortion policies."},{"type":"text","value":"This is..."}]}}]},{"section":"pick","content":[{"type":"Pick","value":{"hed":"To help you navigate the mazes we've highlighted <strong>6 individual abortion stories.</strong>","sub":"These stories were sourced from news reports, but some identifying characteristics have been changed.","directionsA":"Pick a story","directionsB":"See all mazes","stories":[{"id":"tx","age":"38"},{"id":"ca","age":"25"},{"id":"tn","age":"32"},{"id":"fl","age":"33"},{"id":"oh","age":"9"},{"id":"mi","age":"17"}]}}]},{"section":"dashboard","content":[{"type":"Dashboard","value":{"doneMessage":"That took a while... and this is just a task you chose to complete on the internet. Imagine if you didn’t have a choice, if it was life or death, if you didn’t have the same rights and freedoms as everyone else. The path to abortion should be as much of a straight line as we can make it.","complexitySentences":[{"type":"text","value":"… is one of the <strong>[COMPLEXITY] complex</strong> states for navigating abortion access."},{"type":"text","value":"… is a <strong>[COMPLEXITY] complex</strong> state for navigating abortion access."}],"banSentences":[{"type":"text","value":"The state does not restrict abortion based on gestational duration."},{"type":"text","value":"The state bans abortion at [LIMIT]."},{"type":"text","value":"The state <strong>completely bans abortion</strong> with very limited exceptions."}]}}]},{"section":"methodology","content":[{"type":"Methodology","value":{"title":"Methodology","content":[{"type":"text","value":"The six personal stories included in this piece from “Ava”, “Billie”, “Courtney”, “Nicki”, “Margot”, and “Simone” were sourced from actual news reports, including reporting by <a href=https://www.cnn.com/>CNN</a>, <a href=https://www.indystar.com/>The Indianapolis Star</a>, <a href=https://www.michiganpublic.org/>Michigan Public Radio</a>, <a href=https://www.propublica.org/>Propublica</a>, <a href=https://www.nytimes.com/>The New York Times</a>, <a href=https://19thnews.org/>The 19th</a>, <a href=https://www.tennessean.com/>The Tennessean</a>, <a href=https://www.tpr.org/>Texas Public Radio</a>, and <a href=https://www.washingtonpost.com/>The Washington Post</a>. Sometimes details were combined from multiple true stories to create a full narrative. Names, ages, and states were altered to protect the privacy and anonymity of the individuals. The illustrations for these stories were done by <a href=https://mariascherlies.com/>Maria Scherlies</a>."},{"type":"text","value":"To calculate the complexity of each state maze, 28 state-level data points from the <a href=https://www.guttmacher.org/>Guttmacher Institute</a> were collected, normalized, weighted, and combined to produce a complexity score. Abortion bans were weighted at 10, with ban exceptions and constitutional measures weighted at 5. Other policies and laws aimed at limiting abortion access were weighted at 2. Other reproductive health policies, like sexual education and contraception access, were weighted at 1."},{"type":"text","value":"Our complexity calculations were last updated on October 17, 2024 and represent a snapshot in time. The mazes may not represent the current ever-evolving abortion landscape in each state due to ongoing legal challenges, court rulings, and new legislation."},{"type":"text","value":"Mazes were generated using a depth first search algorithm, with a size and difficulty that matched the complexity score."},{"type":"text","value":"The full list of data points, sources, and when they were last updated by Guttmacher Institute is below."}]}}]}]}
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/data/facts.csv">
```text
id,index,fact
ak,0,Abortions are covered by state Medicaid funds.
ak,1,All qualified health care professionals can perform abortions.
ak,2,Patients must obtain medication abortion from a doctor.
ak,3,Individual providers may refuse to perform abortions.
ak,4,Private institutions may refuse to perform abortions.
al,0,Abortion rights are explicitly excluded in the state constitution.
al,1,Patients must attend counseling 48 hours before obtaining an abortion.
al,2,Patients must get an ultrasound even if it is medically unnecessary.
al,3,Patients must obtain medication abortion in person.
al,4,Parental consent is required for minors seeking abortions.
ar,0,Patients must attend in-person counseling 72 hours before obtaining an abortion.
ar,1,Patients must get an ultrasound even if it is medically unnecessary.
ar,2,Medicaid coverage of abortion is banned with very little exceptions.
ar,3,Parental consent is required for minors seeking abortions.
ar,4,Only physicians can provide abortions.
az,0,Patients must attend in-person counseling 24 hours before obtaining an abortion.
az,1,Patients must get an ultrasound even if it is medically unnecessary.
az,2,Patients must obtain medication abortion in person.
az,3,Mailing abortion pills is banned.
az,4,Parental consent is required for minors seeking abortions.
ca,0,NAME is a 25-year-old chef in California.
ca,1,They moved there right out of college and started working as a chef at a friend of a friend of a friend’s restaurant.
ca,2,"Their second night on the job, they met their partner. They’ve been together ever since. Going on 3 years."
ca,3,"During year 2, NAME’s partner’s sister couldn’t take care of her twins anymore, so they suddenly went from uncles to dads. "
ca,4,"Growing up, they never envisioned having kids. Mostly because “having kids” meant doing it the natural way. And well, NAME, was transgender."
ca,5,"After years of being out of place in their own body, they had top surgery and were taking testosterone. But that joy came to an abrupt halt. NAME got pregnant."
ca,6,"NAME was happy with their life: their partner, their two adopted children, even their cramped apartment. They didn’t want to be pregnant. So they wanted an abortion."
ca,7,"NAME’s partner worked at a hospital, so they went there, but NAME was misgendered and denied prescription abortion medication because of the hospital's religious affiliation."
ca,8,"Defeated, they went home and began to mindlessly scroll through their social feeds. Suddenly they saw an ad for LGBTQ+ telehealth abortion care."
ca,9,"They could order the pills. NAME was relieved, but California’s abortion maze should have been simpler."
co,0,Parental notification is require for minors seeking abortions.
co,1,All qualified health care professionals can perform abortions.
co,2,Medicaid coverage of abortion is banned with very little exceptions.
co,3,Abortion providers are protected by a shield law.
co,4,Abortion clinics are protected by a bubble zone.
ct,0,Abortions are covered by state Medicaid funds.
ct,1,All qualified health care professionals can perform abortions.
ct,2,Abortion providers are protected by a shield law.
ct,3,Abortion clinics face unnecessary regulations without basis in medical standards.
ct,4,Individual providers may refuse to perform abortions.
dc,0,"DC is under the jurisdiction of the US Congress, who can modify or overturn legislation and impose unwanted laws on DC."
dc,1,Medicaid coverage of abortion is banned with very little exceptions.
dc,2,Abortion providers are protected by a shield law.
dc,3,Laws prohibit obstructing access to abortion clinics.
dc,4,Emergency rooms must dispense emergency contraception upon request.
de,0,Medicaid coverage of abortion is banned with very little exceptions.
de,1,Parental notification is require for minors seeking abortions.
de,2,All qualified health care professionals can perform abortions.
de,3,Abortion providers are protected by a shield law.
de,4,Individual providers may refuse to perform abortions.
fl,0,NAME is a 33-year-old woman in Florida.
fl,1,"On the day before Thanksgiving, NAME, her husband, and their 8-year-old son went to her scheduled ultrasound. NAME was 23 weeks pregnant."
fl,2,"They were all excited about the possibility of a new sibling, but their excitement turned to fear when the technician suddenly left the room to get the doctor."
fl,3,"NAME’s baby had no right kidney, had too little amniotic fluid, and had a swollen heart. She was told her baby was “incompatible with life.”"
fl,4,"The baby would likely be stillborn or would die within minutes, or at most hours, after birth. NAME was also at risk of preeclampsia, a potentially deadly complication."
fl,6,"She was advised to seek care out-of-state, but NAME and her husband didn’t have the money to travel. So, she carried her baby for 13 more weeks, knowing it would die"
fl,5,NAME was well past Florida’s 15-week abortion limit and her doctor would not terminate the pregnancy because of the state’s other restrictions.
fl,7,"Those weeks were gut wrenching and NAME started experiencing extreme depression and anxiety for the first time in her life. At 37 weeks, doctors induced labor."
fl,8,"NAME and her husband watched their baby take his first breath, and then 94 minutes later, watched it take his last. The experience shattered NAME’s family. "
fl,9,"Her 8-year-old had his dreams of becoming a big brother ripped away, and her relationship with her husband was strained. Florida’s abortion maze created this trauma."
ga,0,Patients must attend counseling 24 hours before obtaining an abortion.
ga,1,Medicaid coverage of abortion is banned with very little exceptions.
ga,2,Parental notification is require for minors seeking abortions.
ga,3,Only physicians can provide abortions.
ga,4,Individual providers may refuse to perform abortions.
hi,0,Abortions are covered by state Medicaid funds.
hi,1,All qualified health care professionals can perform abortions.
hi,2,Abortion providers are protected by a shield law.
hi,3,Individual providers may refuse to perform abortions.
hi,4,Institutions may refuse to perform abortions.
ia,0,Patients must attend in-person counseling 24 hours before obtaining an abortion.
ia,1,Patients must get an ultrasound even if it is medically unnecessary.
ia,2,Medicaid coverage of abortion is banned with very little exceptions.
ia,3,Parental notification is require for minors seeking abortions.
ia,4,Only physicians can provide abortions.
id,0,Patients must attend counseling 24 hours before obtaining an abortion.
id,1,Medicaid coverage of abortion is banned with very little exceptions.
id,2,Private health coverage of abortion is banned with very little exceptions.
id,3,Parental consent is required for minors seeking abortions.
id,4,Only physicians can provide abortions.
il,0,Abortions are covered by state Medicaid funds.
il,1,Abortions must be covered by private health insurance.
il,2,All qualified health care professionals can perform abortions.
il,3,Abortion providers are protected by a shield law.
il,4,Laws protect data privacy for patients seeking reproductive health care.
in,0,Patients must attend in-person counseling 18 hours before obtaining an abortion.
in,1,Medicaid coverage of abortion is banned with very little exceptions.
in,2,Private health coverage of abortion is banned with very little exceptions.
in,3,Patients must obtain medication abortion in person.
in,4,Parental consent is required for minors seeking abortions.
ks,0,Medicaid coverage of abortion is banned with very little exceptions.
ks,1,Private health coverage of abortion is banned with very little exceptions.
ks,2,Parental consent is required for minors seeking abortions.
ks,3,Only physicians can provide abortions.
ks,4,Individual providers may refuse to perform abortions.
ky,0,Patients must attend in-person counseling 24 hours before obtaining an abortion.
ky,1,Patients must get an ultrasound even if it is medically unnecessary.
ky,2,Medicaid coverage of abortion is banned with very little exceptions.
ky,3,Private health coverage of abortion is banned with very little exceptions.
ky,4,Patients must obtain medication abortion in person.
la,0,Abortion rights are explicitly excluded in the state constitution.
la,1,Patients must attend in-person counseling 24 hours before obtaining an abortion.
la,2,Patients must get an ultrasound even if it is medically unnecessary.
la,3,Medicaid coverage of abortion is banned with very little exceptions.
la,4,Patients must obtain medication abortion in person.
ma,0,Parental consent is required for minors seeking abortions.
ma,1,Abortions are covered by state Medicaid funds.
ma,2,Abortions must be covered by private health insurance.
ma,3,All qualified health care professionals can perform abortions.
ma,4,Abortion providers are protected by a shield law.
md,0,Parental notification is require for minors seeking abortions.
md,1,Abortion clinics face unnecessary regulations without basis in medical standards.
md,2,Abortions are covered by state Medicaid funds.
md,3,Abortions must be covered by private health insurance.
md,4,All qualified health care professionals can perform abortions.
me,0,Abortions are covered by state Medicaid funds.
me,1,Abortions must be covered by private health insurance.
me,2,All qualified health care professionals can perform abortions.
me,3,Abortion providers are protected by a shield law.
me,4,Individual providers may refuse to perform abortions.
mi,0,NAME is a 17-year-old girl in Michigan.
mi,1,"She has been in the foster system since she was 3 and has been bounced around to 4 maybe 5 families. So, the idea of “love” — it’s pretty confusing."
mi,2,"But her boyfriend is her home. They’ve had sex a few times. Her school doesn’t mandate sex ed, so she's picked up things from her friends and the internet. "
mi,3,"She’s been told that you should only have sex when you’re married and when you’re ready to start a family, but like “love,” “family” is hard to imagine for NAME."
mi,4,"Right after senior year starts, NAME notices that she hasn’t gotten her period. She tries to stay calm, but a week and two positive pregnancy tests later, she panics."
mi,5,NAME and her boyfriend decide that getting an abortion is their best option. They make an appointment at the nearest clinic. 
mi,6,"While filling out the paperwork, they realize they’re missing an important piece under Michigan law: parental consent. NAME hasn’t talked to her parents in 14 years."
mi,7,"NAME files a petition to waive parental consent, but the judge rejects it  saying she “lacked sufficient maturity” and that the “waiver was not in her best interest.” "
mi,8,"NAME files an appeal, and it is granted. The next day NAME and her boyfriend return to the clinic. "
mi,9,"He holds her hand and cries with her. They know they are doing the right thing, but Michigan’s abortion maze doesn’t make it any easier."
mn,0,Abortions are covered by state Medicaid funds.
mn,1,All qualified health care professionals can perform abortions.
mn,2,Abortion providers are protected by a shield law.
mn,3,Individual providers may refuse to perform abortions.
mn,4,Private institutions may refuse to perform abortions.
mo,0,Patients must attend in-person counseling 72 hours before obtaining an abortion.
mo,1,Medicaid coverage of abortion is banned with very little exceptions.
mo,2,Private health coverage of abortion is banned with very little exceptions.
mo,3,Patients must obtain medication abortion in person.
mo,4,Parental consent is required for minors seeking abortions.
ms,0,Patients must attend in-person counseling 24 hours before obtaining an abortion.
ms,1,Patients must get an ultrasound even if it is medically unnecessary.
ms,2,Medicaid coverage of abortion is banned with very little exceptions.
ms,3,Patients must obtain medication abortion in person.
ms,4,Parental consent is required for minors seeking abortions.
mt,0,Parental notification is require for minors seeking abortions.
mt,1,Abortions are covered by state Medicaid funds.
mt,2,All qualified health care professionals can perform abortions.
mt,3,Individual providers may refuse to perform abortions.
mt,4,Private institutions may refuse to perform abortions.
nc,0,Patients must attend in-person counseling 72 hours before obtaining an abortion.
nc,1,Medicaid coverage of abortion is banned with very little exceptions.
nc,2,Parental consent is required for minors seeking abortions.
nc,3,All qualified health care professionals can perform abortions.
nc,4,Abortion clinics face unnecessary regulations without basis in medical standards.
nd,0,Patients must attend counseling 24 hours before obtaining an abortion.
nd,1,Medicaid coverage of abortion is banned with very little exceptions.
nd,2,Private health coverage of abortion is banned with very little exceptions.
nd,3,Patients must obtain medication abortion in person.
nd,4,Parental consent is required for minors seeking abortions.
ne,0,Patients must attend counseling 24 hours before obtaining an abortion.
ne,1,Medicaid coverage of abortion is banned with very little exceptions.
ne,2,Private health coverage of abortion is banned with very little exceptions.
ne,3,Patients must obtain medication abortion in person.
ne,4,Parental consent is required for minors seeking abortions.
nh,0,Medicaid coverage of abortion is banned with very little exceptions.
nh,1,Parental notification is require for minors seeking abortions.
nh,2,All qualified health care professionals can perform abortions.
nh,3,Family planning funds are barred from going to abortion providers.
nh,4,Pharmacists may dispense emergency contraception.
nj,0,Abortions are covered by state Medicaid funds.
nj,1,Abortions must be covered by private health insurance.
nj,2,All qualified health care professionals can perform abortions.
nj,3,Abortion providers are protected by a shield law.
nj,4,Individual providers may refuse to perform abortions.
nm,0,Abortions are covered by state Medicaid funds.
nm,1,All qualified health care professionals can perform abortions.
nm,2,Abortion providers are protected by a shield law.
nm,3,Individual providers may refuse to perform abortions.
nm,4,Institutions may refuse to perform abortions.
nv,0,Only physicians can provide abortions.
nv,1,Abortion providers are protected by a shield law.
nv,2,Individual providers may refuse to perform abortions.
nv,3,Private institutions may refuse to perform abortions.
nv,4,Laws prohibit obstructing access to abortion clinics.
ny,0,Abortions are covered by state Medicaid funds.
ny,1,Abortions must be covered by private health insurance.
ny,2,All qualified health care professionals can perform abortions.
ny,3,State fund helps patients pay for abortion care.
ny,4,Abortion providers are protected by a shield law.
oh,0,NAME is a 9-year-old girl in Ohio.
oh,1,She likes singing along to pop music and making beaded friendship bracelets with the sisters that live down the street.
oh,2,"She lives with her mom and her mom’s live in boyfriend. Her mom is nice and funny, but the boyfriend makes NAME do things she doesn’t like to do."
oh,3,"The first time this happened, she was scared so she didn’t tell anyone. After the second time, NAME started to feel funny, so she confided in her mom."
oh,4,Her mom gave her a name for what had happened: rape. NAME was just over 6 weeks pregnant. She needed an abortion. 
oh,5,"But her home state, Ohio, had a trigger ban at 6 weeks with no exceptions for rape so they were forced to drive out of state."
oh,6,"It was all very scary for NAME. The procedure was painful, but everyone told her she was brave — even her mom, who’s eyes were wet with sadness."
oh,7,"The doctor that performed her abortion, shared NAME’s story anonymously and soon it was all over the news. Her mom’s old boyfriend was sentenced to jail."
oh,8,"NAME couldn’t help but think all of this was her fault. But, it wasn’t. Not the rape. Not the abortion. "
oh,9,Ohio's trigger ban has since changed but not before NAME had to find a way through the state's abortion maze.
ok,0,Patients must attend counseling 72 hours before obtaining an abortion.
ok,1,Medicaid coverage of abortion is banned with very little exceptions.
ok,2,Private health coverage of abortion is banned with very little exceptions.
ok,3,Patients must obtain medication abortion in person.
ok,4,Parental consent is required for minors seeking abortions.
or,0,Abortion rights are explicitly protected in the state constitution.
or,1,Abortions are covered by state Medicaid funds.
or,2,Abortions must be covered by private health insurance.
or,3,All qualified health care professionals can perform abortions.
or,4,State fund helps patients pay for abortion care.
pa,0,Patients must attend counseling 24 hours before obtaining an abortion.
pa,1,Medicaid coverage of abortion is banned with very little exceptions.
pa,2,Parental consent is required for minors seeking abortions.
pa,3,Only physicians can provide abortions.
pa,4,Abortion clinics face unnecessary regulations without basis in medical standards.
ri,0,Abortions are covered by state Medicaid funds.
ri,1,Parental consent is required for minors seeking abortions.
ri,2,Abortion clinics face unnecessary regulations without basis in medical standards.
ri,3,All qualified health care professionals can perform abortions.
ri,4,Abortion providers are protected by a shield law.
sc,0,Patients must attend counseling 24 hours before obtaining an abortion.
sc,1,Patients must get an ultrasound even if it is medically unnecessary.
sc,2,Medicaid coverage of abortion is banned with very little exceptions.
sc,3,Patients must obtain medication abortion in person.
sc,4,Parental consent is required for minors seeking abortions.
sd,0,Patients must attend in-person counseling 72 hours before obtaining an abortion.
sd,1,Medicaid coverage of abortion is banned with very little exceptions.
sd,2,Patients must obtain medication abortion in person.
sd,3,Parental notification is require for minors seeking abortions.
sd,4,Only physicians can provide abortions.
tn,0,NAME is a 32-year-old mother of four in Tennessee.
tn,1,"Five months after the birth of her 3rd child, she was shocked to learn she was pregnant again despite taking birth control."
tn,2,Her 8-week ultrasound showed that the embryo had become implanted in scar tissue from her recent cesarean section — an ectopic pregnancy. Her life was at risk.
tn,3,"But in just hours, the state of Tennessee would ban abortion following the Supreme Court’s Dobbs ruling."
tn,4," There was no exception in case of risk to the mother's life, and anyone who performed an abortion could be charged with a felony."
tn,5,"NAME thought about traveling out of state for an abortion, but it was costly and she had other children to care for, plus other states had waiting period restrictions."
tn,6,"So, she waited. At 26 weeks she started bleeding and was rushed to the hospital. NAME had an emergency C-section where doctors pulled about a baby girl. "
tn,7,"They weren’t sure if either the baby or NAME would survive. At first, the baby girl had trouble breathing on her own — her lungs weren’t fully developed. "
tn,8,"NAME had a giant vertical gash that ran the length of her abdomen. There was so much damage, she would never have another child."
tn,9,"After spending close to 2 months in the hospital, NAME took the baby girl home. They had made it through Tennessee’s abortion maze, but not without lasting scars."
tx,0,NAME is a 38-year-old lawyer in Texas.
tx,1,"She never pictured herself having children, and when she finds herself pregnant, that just reaffirms her position. She wanted an abortion."
tx,2,"NAME felt that getting pills through the mail was unnecessarily difficult and uncertain, especially with all of the lawsuits swirling in her state. But Mexico was close."
tx,3,She didn’t tell any of her family because she didn’t think they would approve. NAME just picked a long weekend and started driving.
tx,4,"It took her about 5 hours, including the delay at border crossing, to get to her destination."
tx,5,"NAME had read up on “medical tourism” — where people cross the border for cheaper care — and she knew where to go, a supermarket with a big pharmacy in the center."
tx,6,She scrambled together a string of Spanish and asked the pharmacist for the medication. No questions asked. $25. And that was it.
tx,7,"While at the market, NAME bought everything she would need for the next two days. Then she checked into her hotel. "
tx,8,"She was nervous following the online instructions alone, but she popped the pill under her tongue. The cramping and bleeding started about 4 hours later. "
tx,9,"NAME thought “unpleasant” was an understatement describing it, but she was lucky to have the ability to do this. The Texas abortion maze just made everything harder."
ut,0,Patients must attend counseling 72 hours before obtaining an abortion.
ut,1,Medicaid coverage of abortion is banned with very little exceptions.
ut,2,Private health coverage of abortion is banned with very little exceptions.
ut,3,Patients must obtain medication abortion in person.
ut,4,Parental consent is required for minors seeking abortions.
va,0,Medicaid coverage of abortion is banned with very little exceptions.
va,1,Parental consent is required for minors seeking abortions.
va,2,All qualified health care professionals can perform abortions.
va,3,Individual providers may refuse to perform abortions.
va,4,Institutions may refuse to perform abortions.
vt,0,Abortion rights are explicitly protected in the state constitution.
vt,1,Abortions are covered by state Medicaid funds.
vt,2,Abortions must be covered by private health insurance.
vt,3,All qualified health care professionals can perform abortions.
vt,4,Abortion providers are protected by a shield law.
wa,0,Abortions are covered by state Medicaid funds.
wa,1,Abortions must be covered by private health insurance.
wa,2,All qualified health care professionals can perform abortions.
wa,3,Abortion providers are protected by a shield law.
wa,4,Laws protect data privacy for patients seeking reproductive health care.
wi,0,Patients must attend in-person counseling 24 hours before obtaining an abortion.
wi,1,Patients must get an ultrasound even if it is medically unnecessary.
wi,2,Medicaid coverage of abortion is banned with very little exceptions.
wi,3,Patients must obtain medication abortion in person.
wi,4,Parental consent is required for minors seeking abortions.
wv,0,Abortion rights are explicitly excluded in the state constitution.
wv,1,Patients must attend counseling 24 hours before obtaining an abortion.
wv,2,Medicaid coverage of abortion is banned with very little exceptions.
wv,3,Patients must obtain medication abortion in person.
wv,4,Parental notification is require for minors seeking abortions.
wy,0,Medicaid coverage of abortion is banned with very little exceptions.
wy,1,Parental consent is required for minors seeking abortions.
wy,2,Only physicians can provide abortions.
wy,3,Individual providers may refuse to perform abortions.
wy,4,Private institutions may refuse to perform abortions.
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/data/sources.csv">
```text
lastUpdated,metric,source,link
"Oct. 16, 2024",Abortion bans,Guttmacher Institute,https://www.guttmacher.org/state-policy/explore/state-policies-later-abortions
"Apr. 24, 2023",Constitutional provisions and laws protecting abortion,Guttmacher Institute,https://www.guttmacher.org/state-policy/explore/abortion-policy-absence-roe
"Oct. 1, 2024",Abortion legislation introduced in states,Guttmacher Institute,https://www.guttmacher.org/state-legislation-tracker
"Oct. 16, 2024","Number of abortions per 1,000 women in 2020",Guttmacher Institute,https://states.guttmacher.org/policies/
"Oct. 16, 2024",Number of abortion clinics in 2017,Guttmacher Institute,https://states.guttmacher.org/policies/
"Oct. 16, 2024",Percentage of women (ages 15–44) who lived in a county without an abortion provider in 2017,Guttmacher Institute,https://states.guttmacher.org/policies/
"Oct. 16, 2024",Percentage of counties without an abortion provider in 2017,Guttmacher Institute,https://states.guttmacher.org/policies/
"Oct. 16, 2024",Average one-way driving distance to the nearest clinic that performs abortions after 24 weeks,Guttmacher Institute,https://states.guttmacher.org/policies/
"Aug. 31, 2023",Abortion bans in cases of sex or race selection or genetic anomaly,Guttmacher Institute,https://states.guttmacher.org/policies/
"Sep. 1, 2023",Bans on specific abortion methods used after the first trimester,Guttmacher Institute,https://www.guttmacher.org/state-policy/explore/bans-specific-abortion-methods-used-after-first-trimester
"Aug. 30, 2023",Counseling requirements and waiting periods,Guttmacher Institute,https://www.guttmacher.org/state-policy/explore/counseling_and-waiting-periods-abortion
"Sep. 1, 2023",Abortion reporting requirements,Guttmacher Institute,https://www.guttmacher.org/state-policy/explore/abortion-reporting-requirements
"Sep. 1, 2023",Parental involvement for minors,Guttmacher Institute,https://www.guttmacher.org/state-policy/explore/parental-involvement-minors-abortions
"Aug. 31, 2023",Protecting confidentiality for individuals insured as dependents,Guttmacher Institute,https://www.guttmacher.org/state-policy/explore/protecting-confidentiality-individuals-insured-dependents
"Oct. 31, 2023",Restrictions on medication abortion,Guttmacher Institute,https://www.guttmacher.org/state-policy/explore/medication-abortion
"Aug. 31, 2023",Targeted regulation of abortion providers (TRAP),Guttmacher Institute,https://www.guttmacher.org/state-policy/explore/targeted-regulation-abortion-providers
"Oct. 16, 2024",Protecting access to clinics,Guttmacher Institute,https://states.guttmacher.org/policies/
"Aug. 31, 2023",State funding of abortion under Medicaid,Guttmacher Institute,https://www.guttmacher.org/state-policy/explore/state-funding-abortion-under-medicaid
"Sep. 1, 2023",State family planning funding restrictions,Guttmacher Institute,https://www.guttmacher.org/state-policy/explore/state-family-planning-funding-restrictions
"Sep. 1, 2023",Requirements for ultrasound,Guttmacher Institute,https://www.guttmacher.org/state-policy/explore/requirements-ultrasound
"Aug. 30, 2023",Consent to reproductive health services by young people,Guttmacher Institute,https://www.guttmacher.org/state-policy/explore/overview-minors-consent-law
"Aug. 30, 2023",Minors’ access to contraceptive services,Guttmacher Institute,https://www.guttmacher.org/state-policy/explore/minors-access-contraceptive-services
"Aug. 31, 2023",Refusing to provide reproductive health services,Guttmacher Institute,https://www.guttmacher.org/state-policy/explore/refusing-provide-health-services
"Sep. 1, 2023",Emergency contraception,Guttmacher Institute,https://www.guttmacher.org/state-policy/explore/emergency-contraception
"Sep. 20, 2024",Insurance coverage of contraceptives,Guttmacher Institute,https://www.guttmacher.org/state-policy/explore/insurance-coverage-contraceptives
"Oct. 16, 2024",Nurses’ authority to prescribe or dispense contraceptives,Guttmacher Institute,https://states.guttmacher.org/policies/
"Sep. 1, 2023",Sex and HIV education,Guttmacher Institute,https://www.guttmacher.org/state-policy/explore/sex-and-hiv-education?gad=1&gclid=CjwKCAjwuqiiBhBtEiwATgvixCSP8j_1LbU1q8_2noPTlG-KyJQ3TTM4XIC6mjC6YM2owckH7wNMsRoCt14QAvD_BwE
"Oct. 16, 2024","""Choose Life"" license plates availability and funding",Guttmacher Institute,https://states.guttmacher.org/policies/
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/data/states.csv">
```text
id,name,story,score,complexity,ban,region,row,col,guttmacher,checked
al,alabama,,46.96634298,most,banned,south,7,8,https://states.guttmacher.org/policies/alabama/abortion-policies,X
ak,alaska,,24.34793337,somewhat,no restriction,west,1,1,https://states.guttmacher.org/policies/alaska/abortion-policies,X
az,arizona,,42.19781445,very,15 weeks,west,6,3,https://states.guttmacher.org/policies/arizona/abortion-policies,X
ar,arkansas,,52.96863547,most,banned,south,7,6,https://states.guttmacher.org/policies/arkansas/abortion-policies,X
ca,california,billie,15.25174472,least,fetal viability (generally between 24–26 weeks),west,5,2,https://states.guttmacher.org/policies/california/abortion-policies,X
co,colorado,,19.09428716,least,no restriction,west,5,4,https://states.guttmacher.org/policies/colorado/abortion-policies,X
ct,connecticut,,21.1464138,somewhat,fetal viability (generally between 24–26 weeks),northeast,4,11,https://states.guttmacher.org/policies/connecticut/abortion-policies,X
de,delaware,,20.22774077,somewhat,fetal viability (generally between 24–26 weeks),south,5,11,https://states.guttmacher.org/policies/delaware/abortion-policies,X
dc,district of columbia,,15.13449718,least,no restriction,south,6,11,https://states.guttmacher.org/policies/dc/abortion-policies,X
fl,florida,nicki,39.36766797,very,6 weeks,south,8,10,https://states.guttmacher.org/policies/florida/abortion-policies,X
ga,georgia,,37.83568906,very,6 weeks,south,7,9,https://states.guttmacher.org/policies/georgia/abortion-policies,X
hi,hawaii,,21.80544393,somewhat,fetal viability (generally between 24–26 weeks),west,7,1,https://states.guttmacher.org/policies/hawaii/abortion-policies,X
id,idaho,,45.8327163,most,banned,west,3,3,https://states.guttmacher.org/policies/idaho/abortion-policies,X
il,illinois,,20.74674437,somewhat,fetal viability (generally between 24–26 weeks),midwest,5,6,https://states.guttmacher.org/policies/illinois/abortion-policies,X
in,indiana,,47.51156832,most,banned,midwest,5,7,https://states.guttmacher.org/policies/indiana/abortion-policies,X
ia,iowa,,41.11944223,very,6 weeks,midwest,4,6,https://states.guttmacher.org/policies/iowa/abortion-policies,X
ks,kansas,,38.54671875,very,22 weeks,midwest,6,5,https://states.guttmacher.org/policies/kansas/abortion-policies,X
ky,kentucky,,45.10828353,most,banned,south,6,7,https://states.guttmacher.org/policies/kentucky/abortion-policies,X
la,louisiana,,48.61659813,most,banned,south,7,5,https://states.guttmacher.org/policies/louisiana/abortion-policies,X
me,maine,,21.28197585,somewhat,fetal viability (generally between 24–26 weeks),northeast,1,12,https://states.guttmacher.org/policies/maine/abortion-policies,X
md,maryland,,19.86717218,least,no restriction,south,5,10,https://states.guttmacher.org/policies/maryland/abortion-policies,X
ma,massachusetts,,19.89905528,least,24 weeks,northeast,3,11,https://states.guttmacher.org/policies/massachusetts/abortion-policies,X
mi,michigan,simone,28.03113279,moderately,no restriction,midwest,3,8,https://states.guttmacher.org/policies/michigan/abortion-policies,X
mn,minnesota,,18.97251966,least,no restriction,midwest,3,6,https://states.guttmacher.org/policies/minnesota/abortion-policies,X
ms,mississippi,,50.53878442,most,banned,south,7,7,https://states.guttmacher.org/policies/mississippi/abortion-policies,X
mo,missouri,,51.44950778,most,banned,midwest,6,6,https://states.guttmacher.org/policies/missouri/abortion-policies,X
mt,montana,,25.58573108,somewhat,fetal viability (generally between 24–26 weeks),west,3,4,https://states.guttmacher.org/policies/montana/abortion-policies,X
ne,nebraska,,40.67254407,very,12 weeks,midwest,5,5,https://states.guttmacher.org/policies/nebraska/abortion-policies,X
nv,nevada,,22.79895471,somewhat,24 weeks,west,5,3,https://states.guttmacher.org/policies/nevada/abortion-policies,X
nh,new hampshire,,25.78356506,moderately,24 weeks,northeast,2,12,https://states.guttmacher.org/policies/new-hampshire/abortion-policies,X
nj,new jersey,,18.0287371,least,no restriction,northeast,4,10,https://states.guttmacher.org/policies/new-jersey/abortion-policies,X
nm,new mexico,,22.37881611,somewhat,no restriction,west,6,4,https://states.guttmacher.org/policies/new-mexico/abortion-policies,X
ny,new york,,16.77594727,least,fetal viability (generally between 24–26 weeks),northeast,3,10,https://states.guttmacher.org/policies/new-york/abortion-policies,X
nc,north carolina,,38.48388857,very,12 weeks,south,6,10,https://states.guttmacher.org/policies/north-carolina/abortion-policies,X
nd,north dakota,,29.96574075,moderately,fetal viability (generally between 24–26 weeks),midwest,3,5,https://states.guttmacher.org/policies/north-dakota/abortion-policies,X
oh,ohio,margot,35.93899511,moderately,20 weeks,midwest,4,8,https://states.guttmacher.org/policies/ohio/abortion-policies,X
ok,oklahoma,,51.41840156,most,banned,south,7,4,https://states.guttmacher.org/policies/oklahoma/abortion-policies,X
or,oregon,,17.41697946,least,no restriction,west,4,2,https://states.guttmacher.org/policies/oregon/abortion-policies,X
pa,pennsylvania,,29.37445396,moderately,24 weeks,northeast,4,9,https://states.guttmacher.org/policies/pennsylvania/abortion-policies,X
ri,rhode island,,23.86485838,somewhat,fetal viability (generally between 24–26 weeks),northeast,3,12,https://states.guttmacher.org/policies/rhode-island/abortion-policies,X
sc,south carolina,,41.32554828,very,6 weeks,south,6,9,https://states.guttmacher.org/policies/south-carolina/abortion-policies,X
sd,south dakota,,50.31404485,most,banned,midwest,4,5,https://states.guttmacher.org/policies/south-dakota/abortion-policies,X
tn,tennessee,courtney,47.73443818,most,banned,south,6,8,https://states.guttmacher.org/policies/tennessee/abortion-policies,X
tx,texas,ava,51.50086619,most,banned,south,8,5,https://states.guttmacher.org/policies/texas/abortion-policies,X
ut,utah,,36.66412344,very,18 weeks,west,4,3,https://states.guttmacher.org/policies/utah/abortion-policies,X
vt,vermont,,17.31269944,least,no restriction,northeast,2,11,https://states.guttmacher.org/policies/vermont/abortion-policies,X
va,virginia,,27.48239948,moderately,the third trimester (around 28 weeks),south,5,9,https://states.guttmacher.org/policies/virginia/abortion-policies,X
wa,washington,,15.7451374,least,fetal viability (generally between 24–26 weeks),west,3,2,https://states.guttmacher.org/policies/washington/abortion-policies,X
wv,west virginia,,43.12165476,most,banned,south,5,8,https://states.guttmacher.org/policies/west-virginia/abortion-policies,X
wi,wisconsin,,33.63107107,moderately,20 weeks,midwest,4,7,https://states.guttmacher.org/policies/wisconsin/abortion-policies,X
wy,wyoming,,27.72423333,moderately,fetal viability (generally between 24–26 weeks),west,4,4,https://states.guttmacher.org/policies/wyoming/abortion-policies,X
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/environment.js">
```javascript
export const browser=true;
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/main.js">
```javascript
import './styles/app.css';import Mini from './Mini.svelte';new Mini({target:document.getElementById('app')});
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/paths.js">
```javascript
export const base='.';
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/stores/misc.js">
```javascript
import { writable, derived } from "svelte/store";

export const mazeData = writable({});
export const selectedState = writable(undefined);
export const pathLength = writable(0);
export const globalGameState = writable("pre");
export const revealMethods = writable(false);

export const currentMazeSize = derived(
	[mazeData, selectedState],
	([$mazeData, $selectedState]) => {
		const arrayLength = $mazeData[$selectedState]?.length || 0;
		return Math.sqrt(arrayLength);
	}
);
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/stores/mq.js">
```javascript
import { browser } from "$app/environment";
import { readable } from "svelte/store";

const queries = {
	"20rem": "(min-width: 20rem)",
	"30rem": "(min-width: 30rem)",
	"40rem": "(min-width: 40rem)",
	"50rem": "(min-width: 50rem)",
	"60rem": "(min-width: 60rem)",
	"70rem": "(min-width: 70rem)",
	"80rem": "(min-width: 80rem)",
	"reducedMotion": "(prefers-reduced-motion: reduce)",
	"desktop": "(hover: hover) and (pointer: fine)"
};

function calculateMedia(mqls) {
	const media = { classNames: "" };
	const mediaClasses = [];
	for (let name in mqls) {
		media[name] = mqls[name].matches;
		if (media[name]) mediaClasses.push(`mq-${name}`);
	}
	media.classNames = mediaClasses.join(" ");
	return media;
}

export default readable({}, (set) => {
	if (!browser) return;
	const mqls = {};
	const onChange = () => set(calculateMedia(mqls));

	if (browser) {
		for (let q in queries) {
			mqls[q] = window.matchMedia(queries[q]);
			mqls[q].addListener(onChange);
		}

		onChange();
	}

	return () => {
		for (let q in mqls) {
			mqls[q].removeListener(onChange);
		}
	};
});
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/stores/viewport.js">
```javascript
import { browser } from "$app/environment";
import { readable } from "svelte/store";
import debounce from "lodash.debounce";

export default readable({ width: 0, height: 0 }, (set) => {
	const onResize = () => set({ width: window.innerWidth, height: window.innerHeight });

	if (browser) {
		onResize();
		window.addEventListener("resize", debounce(onResize, 250));
	}

	return () => {
		if (browser) window.removeEventListener("resize", onResize);
	};
});
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/styles/app.css">
```css
@import "variables.css";
@import "normalize.css";
@import "font.css";
@import "reset.css";

/* colors defined in variables.css */
:root {
	/* font */
	--sans: "National", -apple-system, BlinkMacSystemFont, Helvetica,
		Arial, sans-serif;
	--serif: "Canela", Iowan Old Style, Times New Roman, Times, serif;
	--mono: "Avenir Next", Menlo, Consolas, Monaco, monospace;

	/* z-index */
	--z-bottom: -100;
	--z-middle: 0;
	--z-top: 100;
	--z-overlay: 1000;

	/* presets (used in reset.css) */
	--border-radius: 2px;
	--font-body: var(--sans);
	--font-form: var(--sans);
	--color-bg: #fffdf8;
	--color-fg: #1c1246;
	--color-primary: var(--color-black);
	--color-link: var(--color-dark-tan);
	--color-focus: var(--color-accent-purple);
	--color-mark: var(--color-purple);
	--color-selection: var(--color-gray-300);
	--color-border: var(--color-gray-300);
	--color-button-bg: var(--color-gray-300);
	--color-button-fg: var(--color-gray-900);
	--color-button-hover: var(--color-gray-400);
	--color-input-bg: var(--color-gray-50);
	--color-input-fg: var(--color-gray-900);
	--color-placeholder: var(--color-gray-500);

	/* colors */
	--color-tan: #DDD3CB;
	--color-dark-tan: #726D68;
	--color-medium-tan: #B9B1AA;
	--color-accent-orange: #F46201;
	--color-accent-dark-orange: #e45b00;
	--color-accent-purple: #6b50dc;

	--font-bold: "Avenir Next Bold", Avenir Next;
	--font-heavy: "Avenir Next Heavy", Avenir Next;

	/* "1" second duration */
	--1s: 1ms;
}

a {
	font-weight: bold;
	border-bottom: 2px solid currentColor;
}
a:hover {
	color: var(--color-fg);
}

/* dark theme */
/* this is a starting place for dark mode - test before deploying */

/* @media screen and (prefers-color-scheme:dark) {
	:root {
		--color-bg: var(--color-gray-900);
		--color-fg: var(--color-gray-100);
		--color-primary: var(--color-white);
		--color-link: var(--color-white);
		--color-focus: var(--color-red);
		--color-mark: var(--color-yellow);
		--color-selection: var(--color-gray-600);
		--color-border: var(--color-gray-600);
		--color-button-bg: var(--color-gray-600);
		--color-button-fg: var(--color-gray-100);
		--color-button-hover: var(--color-gray-700);
		--color-input-bg: var(--color-gray-800);
		--color-input-fg: var(--color-gray-100);
		--color-placeholder: var(--color-gray-400);
		--color-text-outline: var(--color-bg);
	}
} */

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
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/styles/font.css">
```css
@font-face {
	font-family: "National";
	src: url("../../assets/fonts/National2Web-Regular.woff2")
		format("woff2");
	font-weight: 400;
	font-style: normal;
	font-stretch: normal;
	font-display: swap;
}

@font-face {
	font-family: "National";
	src: url("../../assets/fonts/National2Web-Bold.woff2")
		format("woff2");
	font-weight: 700;
	font-style: normal;
	font-stretch: normal;
	font-display: swap;
}

@font-face {
	font-family: "Canela";
	src: url("../../assets/fonts/Canela-Light-Web.woff2")
		format("woff2");
	font-weight: 300;
	font-style: normal;
	font-stretch: normal;
	font-display: swap;
}

@font-face {
	font-family: "Canela";
	src: url("../../assets/fonts/Canela-Bold-Web.woff2")
		format("woff2");
	font-weight: 700;
	font-style: normal;
	font-stretch: normal;
	font-display: swap;
}
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/styles/normalize.css">
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
  <file path="samples/general/state-maze-stories/pages/src/styles/reset.css">
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
  <file path="samples/general/state-maze-stories/pages/src/styles/variables.css">
```css
/**
 * Do not edit directly
 * Generated on Wed, 18 Sep 2024 00:21:52 GMT
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
  <file path="samples/general/state-maze-stories/pages/src/utils/loadMazeData.js">
```javascript
import { csv } from "d3";
import { mazeData } from "$stores/misc.js";
import { get } from "svelte/store";

const loadMazeData = async (id) => {
	if (get(mazeData)[id]) {
		return get(mazeData)[id];
	}

	let data = await csv(`assets/data/${id}.csv`);
	data = data.map((d) => ({
		row: +d.row,
		col: +d.col,
		solutionIndex: d.solutionIndex ? +d.solutionIndex : null,
		walls: d.walls.split("|").map((w) => (w === "t" ? true : false))
	}));
	mazeData.update((d) => ({ ...d, [id]: data }));

	return data;
};

export default loadMazeData;
```
  </file>
  <file path="samples/general/state-maze-stories/pages/src/utils/localStorage.js">
```javascript
let hasStorage;

const isReady = () => {
	if (hasStorage !== undefined) return hasStorage;

	try {
		const storage = window["localStorage"];
		const x = "__storage_test__";
		storage.setItem(x, x);
		storage.removeItem(x);
		hasStorage = true;
	} catch (e) {
		hasStorage = false;
	} finally {
		return hasStorage;
	}
};

const remove = (key) => {
	if (!isReady()) return;
	try {
		localStorage.removeItem("pudding-state-maze-" + key);
	} catch (err) {
		console.log(err);
	}
};

const set = (key, value) => {
	if (!isReady()) return;
	try {
		localStorage.setItem("pudding-state-maze-" + key, JSON.stringify(value));
	} catch (err) {
		console.log(err);
	}
};

const get = (key) => {
	if (!isReady()) return;
	try {
		return JSON.parse(localStorage.getItem("pudding-state-maze-" + key));
	} catch (err) {
		console.log(err);
		return undefined;
	}
};

export default {
	set,
	get,
	remove
};
```
  </file>
  <omitted path="build/build-534e080e.css">Locally shipped runtime build or library dependency; readable author components and styles are included in this bundle.</omitted>
  <omitted path="build/build-f66bb0e3.js">Locally shipped runtime build or library dependency; readable author components and styles are included in this bundle.</omitted>
</sample>
