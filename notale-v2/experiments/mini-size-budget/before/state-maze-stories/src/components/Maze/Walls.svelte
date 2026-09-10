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
    {@const x = col * $cellSize}
    {@const y = row * $cellSize}
    {@const half = $wallWidth / 2}
    {@const segments = [
      top && (row !== 0 || col !== 0) ? [x-half, x+$cellSize+half, y, y] : null,
      right ? [x+$cellSize, x+$cellSize, y-half, y+$cellSize+half] : null,
      bottom && (row !== $dims-1 || col !== $dims-1) ? [x+$cellSize+half, x-half, y+$cellSize, y+$cellSize] : null,
      left ? [x, x, y+$cellSize+half, y-half] : null
    ].filter(Boolean)}
    {#each segments as [x1, x2, y1, y2]}
      <line {x1} {x2} {y1} {y2} stroke-width={$wallWidth} transition:draw={lineDraw} />
    {/each}
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
