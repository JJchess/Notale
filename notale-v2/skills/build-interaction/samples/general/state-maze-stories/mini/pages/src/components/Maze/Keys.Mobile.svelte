<script>
  import nextLocation from "$utils/nextLocation.js";
	import Icon from "$components/helpers/Icon.svelte";
	import { getContext } from "svelte";

	const { getData, getGameState, getSpaceAvailable, getPath, getLocation } =
		getContext("maze");
	const data = getData();
	const gameState = getGameState();
	const spaceAvailable = getSpaceAvailable();
	const path = getPath();
	const location = getLocation();

  const move = direction => {
    const next = nextLocation($data, $location, direction);
    if (next) { $location = next; $path = [...$path, $location]; }
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
