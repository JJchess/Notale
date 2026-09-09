<script>
  import Crossword from "../../vendor/svelte-crossword/src/Crossword.svelte";
  export let id;
  export let title;
  export let theme = "classic";
  export let puzzles = [];

  const revealDuration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1000;
  let width = innerWidth;
  let active;
  let revealed;
  let current;

  $: currentId = puzzles.find((d) => d.id === current)
    ? current
    : puzzles[0].id;
  $: puzzle = puzzles.find((d) => d.id === currentId);
  $: name = puzzle.value;
  $: data = addCustom(puzzle.data);
  $: percentURM = puzzle.urm;
  $: percentWoman = puzzle.woman;

  function addCustom(arr) {
    return arr.map((d) => ({
      ...d,
      custom: `${d.race} ${d.gender}`,
    }));
  }
</script>

<svelte:window bind:innerWidth={width} />

<section id="{id}" class="{theme}">
  <div class="info">
    <h2>{title}</h2>
    <select aria-label="Puzzle" bind:value="{current}">
      {#each puzzles as { id, value }}
        <option value="{id}">{value}</option>
      {/each}
    </select>
  </div>

  <div class="content">
    {#if currentId === "nyt1970s"}<p class="correction">1970s: the main study reports 9% minoritized racial groups. This corrects a 91% typo in the companion puzzle data.</p>{/if}
    <p class="insight" class:revealed>
      Our analysis of people in
      {name}
      puzzles revealed that
      <br />
      <button
        title="{revealed ? '' : 'complete the puzzle to see finding'}"
        class:active="{active === 'woman'}"
        class="woman"
        on:click="{() => (active = active === 'woman' ? null : 'woman')}"><span><span
            class="value">{percentWoman}</span></span>
        were women</button>
      and
      <button
        title="{revealed ? '' : 'complete the puzzle to see finding'}"
        class:active="{active === 'urm'}"
        class="urm"
        on:click="{() => (active = active === 'urm' ? null : 'urm')}"><span><span
            class="value">{percentURM}</span></span>
        were minoritized racial groups.</button>
    </p>

    <div
      class="xd"
      class:revealed
      class:urm="{active === 'urm'}"
      class:woman="{active === 'woman'}">
      <Crossword
        data="{data}"
        theme="{theme}"
        disableHighlight="{true}"
        showKeyboard="{revealed !== true && width < 720}"
        {revealDuration}
        bind:revealed />
    </div>
  </div>
</section>

<style>
  section {
    --xd-cell-text-font: var(--sans);
    --xd-clue-text-font: var(--sans);
    --xd-toolbar-text-font: var(--sans);
    max-width: 960px;
    margin: 3rem auto;
    margin-bottom: 6rem;
  }

  .info {
    text-align: left;
  }

  h2 {
    font-size: 1.5em;
  }

  .content {
    display: flex;
    flex-direction: column;
  }

  .xd {
    max-width: 800px;
    margin: 0 auto;
    font-family: --sans;
    width: 100%;
    order: 0;
  }

  .insight {
    width: 100%;
    max-width: var(--column-width);
    margin: 1em auto;
    font-size: 0.85em;
    line-height: 2.2;
    order: 1;
    display: none;
  }

  .insight.revealed {
    display: block;
  }

  button {
    cursor: not-allowed;
  }

  span {
    font-weight: 700;
    border-bottom: 2px solid currentColor;
  }

  .value {
    opacity: 0;
    border: none;
  }

  .revealed .value {
    opacity: 1;
  }

  .revealed span {
    border: none;
  }

  .revealed button {
    cursor: pointer;
  }

  .active {
    opacity: 1;
  }

  .revealed .active.urm {
    background-color: var(--urm);
  }

  .revealed .active.woman {
    background-color: var(--woman);
  }

  br {
    display: none;
  }

  @media only screen and (min-width: 640px) {
    .info {
      text-align: center;
    }
    .insight {
      order: 0;
      font-size: 1em;
      text-align: center;
      display: block;
      line-height: 1.8;
    }
    .xd {
      order: 1;
    }
    h2 {
      font-size: 2em;
    }
    br {
      display: block;
    }
  }
</style>
