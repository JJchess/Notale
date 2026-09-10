<sample id="crossword-representation" category="general" variant="full">
  <file path="samples/general/crossword-representation/pages/index.html">
```html
<!doctype html><html lang="en">
<script type="module" crossorigin src="./build/assets/index-64022410.js"></script>
<link rel="stylesheet" href="./build/assets/index-95148e6d.css">
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Who comes to mind? · Sample</title><div id="app"></div></html>
```
  </file>
  <file path="samples/general/crossword-representation/pages/src/App.svelte">
```svelte
<script>
import Play from './components/Play.svelte';
import {puzzlesNYT,puzzlesToday} from './utils/loadData.js';
let group='publications';
</script>
<main><header><a href="../../../../../index.html" target="_top">← Samples</a><span>THE PUDDING / 2020 ARCHIVE</span></header>
<section class="intro"><p class="eyebrow">PLAY THE PUZZLE. SEE WHO IS IN IT.</p><h1>Who comes to mind?</h1><p>Thirteen original mini crosswords turn a study of representation into something you can play. Solve a puzzle, then highlight the people behind its clues.</p><p class="credit">By Russell Samora, Michelle Pera-McGhee & Amelia Wattenberger · <a href="https://pudding.cool/2020/11/crossword-puzzles/" target="_blank" rel="noopener">Original ↗</a> · <a href="SAMPLE.md">Review notes</a></p></section>
<nav aria-label="Puzzle collection"><button class:chosen={group==='publications'} on:click={()=>group='publications'}>5 publications · 2020</button><button class:chosen={group==='decades'} on:click={()=>group='decades'}>NYT · 8 decades</button></nav>
{#key group}<Play id="puzzle" puzzles={group==='publications'?puzzlesToday:puzzlesNYT} title={group==='publications'?'Major Publications in 2020':'New York Times by Decade'}/>{/key}
<footer><p>Each mini has 10 clues. The original study’s percentages were rounded to the nearest 10% when constructing these puzzles. The findings describe the study’s historical dataset, not current publications.</p><details><summary>How were these made?</summary><p>The authors used Saul Pwanson’s crossword database and their analysis of named people in clues and answers. Their race and gender classifications and methodology remain those of the original 2020 study.</p><p><a href="https://pudding.cool/2020/11/crossword/#methodology" target="_blank" rel="noopener">Read the original study and methodology ↗</a></p></details></footer></main>
<svg>
  <defs>
    <pattern
      id="pattern-urm"
      x="0"
      y="0"
      width="1"
      height="1"
      patternUnits="userSpaceOnUse">
      <rect x="0" y="0" width="1" height="1" fill="#fff"></rect>
      <path d="M0 0 L 0 1 L 1 0 L 0 0" fill="#C63DA3"></path>
    </pattern>

    <pattern
      id="pattern-woman"
      x="0"
      y="0"
      width="1"
      height="1"
      patternUnits="userSpaceOnUse">
      <rect x="0" y="0" width="1" height="1" fill="#fff"></rect>
      <path d="M0 0 L 0 1 L 1 0 L 0 0" fill="#4864FE"></path>
    </pattern>
  </defs>
</svg>
<style>svg{height:0;overflow:hidden;position:absolute}</style>
```
  </file>
  <file path="samples/general/crossword-representation/pages/src/components/Play.svelte">
```svelte
<script>
  import Crossword from "svelte-crossword";
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
        showConfetti="{false}"
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
```
  </file>
  <file path="samples/general/crossword-representation/pages/src/data/lat2020.json">
```json
[
  {
    "x": 1,
    "y": 0,
    "answer": "ESAI",
    "direction": "across",
    "clue": "Morales of TV's \"Titans\"",
    "race": "urm",
    "binaryRace": "white",
    "hispanic": "TRUE",
    "gender": "man",
    "name": "Esai Morales",
    "wiki": "https://en.wikipedia.org/wiki/Esai_Morales",
    "description": "American actor"
  },
  {
    "x": 2,
    "y": 0,
    "answer": "SOREN",
    "direction": "down",
    "clue": "Philosopher Kierkegaard",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Søren Kierkegaard",
    "wiki": "https://en.wikipedia.org/wiki/S%C3%B8ren_Kierkegaard",
    "description": "Danish philosopher, theologian, poet, social critic, and religious author"
  },
  {
    "x": 3,
    "y": 0,
    "answer": "ARI",
    "direction": "down",
    "clue": "Bush press secretary Fleischer",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Ari Fleischer",
    "wiki": "https://en.wikipedia.org/wiki/Ari_Fleischer",
    "description": "White House Press secretary"
  },
  {
    "x": 4,
    "y": 0,
    "answer": "IRA",
    "direction": "down",
    "clue": "George's musical sibling",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Ira Gershwin",
    "wiki": "https://en.wikipedia.org/wiki/Ira_Gershwin",
    "description": "American lyricist (1896-1983)"
  },
  {
    "x": 2,
    "y": 1,
    "answer": "ORR",
    "direction": "across",
    "clue": "\"Bobby Hockey\"",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Bobby Orr",
    "wiki": "https://en.wikipedia.org/wiki/Bobby_Orr",
    "description": "Canadian ice hockey player"
  },
  {
    "x": 0,
    "y": 2,
    "answer": "MORIA",
    "direction": "across",
    "clue": "Realm of Tolkien's Dwarves",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "J. R. R. Tolkien",
    "wiki": "https://en.wikipedia.org/wiki/J._R._R._Tolkien",
    "description": "British philologist and author, creator of classic fantasy works"
  },
  {
    "x": 0,
    "y": 2,
    "answer": "MEL",
    "direction": "down",
    "clue": "Harris of \"thirtysomething\"",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Mel Harris",
    "wiki": "https://en.wikipedia.org/wiki/Mel_Harris",
    "description": "American actress"
  },
  {
    "x": 1,
    "y": 2,
    "answer": "ORA",
    "direction": "down",
    "clue": "U.K. singer Rita __",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Rita Ora",
    "wiki": "https://en.wikipedia.org/wiki/Rita_Ora",
    "description": "British singer and actress"
  },
  {
    "x": 0,
    "y": 3,
    "answer": "ERE",
    "direction": "across",
    "clue": "\"... __ he drove out of sight\": Moore",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Clement Clarke Moore",
    "wiki": "https://en.wikipedia.org/wiki/Clement_Clarke_Moore",
    "description": "American writer and Professor of Literature"
  },
  {
    "x": 0,
    "y": 4,
    "answer": "LANI",
    "direction": "across",
    "clue": "Social activist Guinier",
    "race": "urm",
    "binaryRace": "poc",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Lani Guinier",
    "wiki": "https://en.wikipedia.org/wiki/Lani_Guinier",
    "description": "American activist, lawyer and academic"
  }
]
```
  </file>
  <file path="samples/general/crossword-representation/pages/src/data/nyt1940s.json">
```json
[
  {
    "x": 1,
    "y": 0,
    "answer": "ADAM",
    "direction": "across",
    "clue": "Celebrated English architect (1728–1792).",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Robert Adam",
    "wiki": "https://en.wikipedia.org/wiki/Robert_Adam",
    "description": "Scottish neoclassical architect (1728-1792)"
  },
  {
    "x": 2,
    "y": 0,
    "answer": "DUMAS",
    "direction": "down",
    "clue": "\"The Count of Monte Cristo\" author",
    "race": "urm",
    "binaryRace": "poc",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Alexandre Dumas",
    "wiki": "https://en.wikipedia.org/wiki/Alexandre_Dumas",
    "description": "French writer and dramatist (1802–1870)"
  },
  {
    "x": 3,
    "y": 0,
    "answer": "ANA",
    "direction": "down",
    "clue": "Communist boss of Rumania.",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Ana Pauker",
    "wiki": "https://en.wikipedia.org/wiki/Ana_Pauker",
    "description": "Romanian politician (1893-1960)"
  },
  {
    "x": 4,
    "y": 0,
    "answer": "MARK",
    "direction": "down",
    "clue": "The Thesaurus doctor.",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Peter Mark Roget",
    "wiki": "https://en.wikipedia.org/wiki/Peter_Mark_Roget",
    "description": "British physician, philologist"
  },
  {
    "x": 0,
    "y": 1,
    "answer": "TSAR",
    "direction": "down",
    "clue": "Title of Nicholas who died at Ekaterinburg, 1918.",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Nicholas II of Russia",
    "wiki": "https://en.wikipedia.org/wiki/Nicholas_II_of_Russia",
    "description": "Emperor of All Russia"
  },
  {
    "x": 2,
    "y": 1,
    "answer": "UNA",
    "direction": "across",
    "clue": "Personification of truth in Spenser's \"Faerie Queene.\"",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Edmund Spenser",
    "wiki": "https://en.wikipedia.org/wiki/Edmund_Spenser",
    "description": "16th-century English poet"
  },
  {
    "x": 0,
    "y": 2,
    "answer": "SAMAR",
    "direction": "across",
    "clue": "Isle invaded by MacArthur.",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Douglas MacArthur",
    "wiki": "https://en.wikipedia.org/wiki/Douglas_MacArthur",
    "description": "U.S. Army general in WWI, WWII and Korea"
  },
  {
    "x": 1,
    "y": 2,
    "answer": "AGE",
    "direction": "down",
    "clue": "\"The ___ of Innocence.\"—Wharton.",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Edith Wharton",
    "wiki": "https://en.wikipedia.org/wiki/Edith_Wharton",
    "description": "American novelist, short story writer, designer"
  },
  {
    "x": 0,
    "y": 3,
    "answer": "AGA",
    "direction": "across",
    "clue": "___ Khan III, Mohammedan leader.",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Aga Khan III",
    "wiki": "https://en.wikipedia.org/wiki/Aga_Khan_III",
    "description": "48th Imam of the Nizari Ismaili community"
  },
  {
    "x": 0,
    "y": 4,
    "answer": "REST",
    "direction": "across",
    "clue": "\"Too much ___ is rust.\"—Scott.",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Walter Scott",
    "wiki": "https://en.wikipedia.org/wiki/Walter_Scott",
    "description": "18th/19th-century Scottish historical novelist, poet and playwright"
  }
]
```
  </file>
  <file path="samples/general/crossword-representation/pages/src/data/nyt1950s.json">
```json
[
  {
    "x": 2,
    "y": 0,
    "answer": "ORR",
    "direction": "across",
    "clue": "Lord Boyd ___.",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "John Boyd Orr",
    "wiki": "https://en.wikipedia.org/wiki/John_Boyd_Orr",
    "description": "Scottish nutritionist, Director-General of the United Nations Food and Agriculture Organization (1880-1971)"
  },
  {
    "x": 2,
    "y": 0,
    "answer": "OWENS",
    "direction": "down",
    "clue": "U. S. track star.",
    "race": "urm",
    "binaryRace": "poc",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Jesse Owens",
    "wiki": "https://en.wikipedia.org/wiki/Jesse_Owens",
    "description": "American track and field athlete"
  },
  {
    "x": 3,
    "y": 0,
    "answer": "RENI",
    "direction": "down",
    "clue": "Italian painter.",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Guido Reni",
    "wiki": "https://en.wikipedia.org/wiki/Guido_Reni",
    "description": "17th-century Bolognese painter"
  },
  {
    "x": 4,
    "y": 0,
    "answer": "RYAN",
    "direction": "down",
    "clue": "Star of \"Men in War.\"",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Robert Ryan",
    "wiki": "https://en.wikipedia.org/wiki/Robert_Ryan",
    "description": "American actor"
  },
  {
    "x": 0,
    "y": 1,
    "answer": "DEWEY",
    "direction": "across",
    "clue": "Noted librarian.",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Melvil Dewey",
    "wiki": "https://en.wikipedia.org/wiki/Melvil_Dewey",
    "description": "American librarian and educator"
  },
  {
    "x": 0,
    "y": 1,
    "answer": "DELA",
    "direction": "down",
    "clue": "Mazo ___ Roche.",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Mazo de la Roche",
    "wiki": "https://en.wikipedia.org/wiki/Mazo_de_la_Roche",
    "description": "Canadian writer"
  },
  {
    "x": 1,
    "y": 1,
    "answer": "ELEE",
    "direction": "down",
    "clue": "Robert ___.",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Robert E. Lee",
    "wiki": "https://en.wikipedia.org/wiki/Robert_E._Lee",
    "description": "Confederate States Army commander"
  },
  {
    "x": 0,
    "y": 2,
    "answer": "ELENA",
    "direction": "across",
    "clue": "Former Queen of Italy.",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Elena of Montenegro",
    "wiki": "https://en.wikipedia.org/wiki/Elena_of_Montenegro",
    "description": "Queen consort of Italy"
  },
  {
    "x": 0,
    "y": 3,
    "answer": "LENIN",
    "direction": "across",
    "clue": "Vladimir Ilich Ulianov.",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Vladimir Lenin",
    "wiki": "https://en.wikipedia.org/wiki/Vladimir_Lenin",
    "description": "Russian politician, communist theorist, and founder of the Soviet Union"
  },
  {
    "x": 0,
    "y": 4,
    "answer": "AES",
    "direction": "across",
    "clue": "Political monogram.",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Adlai Stevenson II",
    "wiki": "https://en.wikipedia.org/wiki/Adlai_Stevenson_II",
    "description": "American politician"
  }
]
```
  </file>
  <file path="samples/general/crossword-representation/pages/src/data/nyt1960s.json">
```json
[
  {
    "x": 0,
    "y": 0,
    "answer": "READE",
    "direction": "across",
    "clue": "British novelist.",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Charles Reade",
    "wiki": "https://en.wikipedia.org/wiki/Charles_Reade",
    "description": "British writer"
  },
  {
    "x": 2,
    "y": 0,
    "answer": "ALLEN",
    "direction": "down",
    "clue": "Famous TV pioneer.",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Allen B. DuMont",
    "wiki": "https://en.wikipedia.org/wiki/Allen_B._DuMont",
    "description": "American electronics engineer and inventor"
  },
  {
    "x": 3,
    "y": 0,
    "answer": "DEL",
    "direction": "down",
    "clue": "Andrea ___ Sarto of Florence.",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Andrea del Sarto",
    "wiki": "https://en.wikipedia.org/wiki/Andrea_del_Sarto",
    "description": "Italian painter (1486-1530)"
  },
  {
    "x": 4,
    "y": 0,
    "answer": "EVA",
    "direction": "down",
    "clue": "Stowe character.",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Harriet Beecher Stowe",
    "wiki": "https://en.wikipedia.org/wiki/Harriet_Beecher_Stowe",
    "description": "19th-century American abolitionist and author"
  },
  {
    "x": 2,
    "y": 1,
    "answer": "LEV",
    "direction": "across",
    "clue": "Real first Leon Trotsky.",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Leon Trotsky",
    "wiki": "https://en.wikipedia.org/wiki/Leon_Trotsky",
    "description": "Marxist revolutionary from Ukraine"
  },
  {
    "x": 0,
    "y": 2,
    "answer": "FALLA",
    "direction": "across",
    "clue": "Spanish composer Manuel.",
    "race": "urm",
    "binaryRace": "white",
    "hispanic": "TRUE",
    "gender": "man",
    "name": "Manuel de Falla",
    "wiki": "https://en.wikipedia.org/wiki/Manuel_de_Falla",
    "description": "Spanish composer (1876-1946)"
  },
  {
    "x": 0,
    "y": 2,
    "answer": "FDR",
    "direction": "down",
    "clue": "The 6c stamp man.",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Franklin D. Roosevelt",
    "wiki": "https://en.wikipedia.org/wiki/Franklin_D._Roosevelt",
    "description": "32nd president of the United States"
  },
  {
    "x": 1,
    "y": 2,
    "answer": "ADE",
    "direction": "down",
    "clue": "American humorist.",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "George Ade",
    "wiki": "https://en.wikipedia.org/wiki/George_Ade",
    "description": "American writer, newspaper columnist and playwright"
  },
  {
    "x": 0,
    "y": 3,
    "answer": "DDE",
    "direction": "across",
    "clue": "Presidential initials.",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Dwight D. Eisenhower",
    "wiki": "https://en.wikipedia.org/wiki/Dwight_D._Eisenhower",
    "description": "American army general and 34th president of the United States (1890–1969)"
  },
  {
    "x": 0,
    "y": 4,
    "answer": "RENES",
    "direction": "across",
    "clue": "Descartes and others.",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "René Descartes",
    "wiki": "https://en.wikipedia.org/wiki/Ren%C3%A9_Descartes",
    "description": "17th-century French philosopher, mathematician, and scientist"
  }
]
```
  </file>
  <file path="samples/general/crossword-representation/pages/src/data/nyt1970s.json">
```json
[
  {
    "x": 2,
    "y": 0,
    "answer": "ABE",
    "direction": "across",
    "clue": "Man from Illinois",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Abraham Lincoln",
    "wiki": "https://en.wikipedia.org/wiki/Abraham_Lincoln",
    "description": "American politician and 16th president of the United States"
  },
  {
    "x": 2,
    "y": 0,
    "answer": "ARLEN",
    "direction": "down",
    "clue": "\"Green Hat\" author",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Michael Arlen",
    "wiki": "https://en.wikipedia.org/wiki/Michael_Arlen",
    "description": "Armenian writer"
  },
  {
    "x": 3,
    "y": 0,
    "answer": "BEA",
    "direction": "down",
    "clue": "Actress Arthur",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Bea Arthur",
    "wiki": "https://en.wikipedia.org/wiki/Bea_Arthur",
    "description": "American actress, singer, and comedian"
  },
  {
    "x": 4,
    "y": 0,
    "answer": "EDNA",
    "direction": "down",
    "clue": "Millay",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Edna St. Vincent Millay",
    "wiki": "https://en.wikipedia.org/wiki/Edna_St._Vincent_Millay",
    "description": "American poet"
  },
  {
    "x": 0,
    "y": 1,
    "answer": "FALK",
    "direction": "down",
    "clue": "Stage and film actor",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Peter Falk",
    "wiki": "https://en.wikipedia.org/wiki/Peter_Falk",
    "description": "American actor"
  },
  {
    "x": 2,
    "y": 1,
    "answer": "RED",
    "direction": "across",
    "clue": "Mr. Buttons",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Red Buttons",
    "wiki": "https://en.wikipedia.org/wiki/Red_Buttons",
    "description": "American comedian and actor"
  },
  {
    "x": 0,
    "y": 2,
    "answer": "ALLAN",
    "direction": "across",
    "clue": "Author of \"The Raven\"",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Edgar Allan Poe",
    "wiki": "https://en.wikipedia.org/wiki/Edgar_Allan_Poe",
    "description": "19th-century American author, poet, editor and literary critic"
  },
  {
    "x": 1,
    "y": 2,
    "answer": "LEO",
    "direction": "down",
    "clue": "Durocher",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Leo Durocher",
    "wiki": "https://en.wikipedia.org/wiki/Leo_Durocher",
    "description": "American baseball player and manager"
  },
  {
    "x": 0,
    "y": 3,
    "answer": "LEE",
    "direction": "across",
    "clue": "Trevino",
    "race": "urm",
    "binaryRace": "white",
    "hispanic": "TRUE",
    "gender": "man",
    "name": "Lee Trevino",
    "wiki": "https://en.wikipedia.org/wiki/Lee_Trevino",
    "description": "American golfer"
  },
  {
    "x": 0,
    "y": 4,
    "answer": "KON",
    "direction": "across",
    "clue": "___-Tiki (Heyerdahl boat)",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Thor Heyerdahl",
    "wiki": "https://en.wikipedia.org/wiki/Thor_Heyerdahl",
    "description": "Norwegian anthropologist and adventurer (1914–2002)"
  }
]
```
  </file>
  <file path="samples/general/crossword-representation/pages/src/data/nyt1980s.json">
```json
[
  {
    "x": 1,
    "y": 0,
    "answer": "ROMA",
    "direction": "across",
    "clue": "Caesar's urbs",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Julius Caesar",
    "wiki": "https://en.wikipedia.org/wiki/Julius_Caesar",
    "description": "Roman general and dictator"
  },
  {
    "x": 2,
    "y": 0,
    "answer": "OSLER",
    "direction": "down",
    "clue": "Canadian physician",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "William Osler",
    "wiki": "https://en.wikipedia.org/wiki/William_Osler",
    "description": "Canadian physician and co-founder of Johns Hopkins Hospital"
  },
  {
    "x": 3,
    "y": 0,
    "answer": "MET",
    "direction": "down",
    "clue": "Showcase for a Pavarotti",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Luciano Pavarotti",
    "wiki": "https://en.wikipedia.org/wiki/Luciano_Pavarotti",
    "description": "Italian operatic tenor"
  },
  {
    "x": 4,
    "y": 0,
    "answer": "ANA",
    "direction": "down",
    "clue": "Actress Alicia",
    "race": "urm",
    "binaryRace": "white",
    "hispanic": "TRUE",
    "gender": "woman",
    "name": "Ana Alicia",
    "wiki": "https://en.wikipedia.org/wiki/Ana_Alicia",
    "description": "American actress"
  },
  {
    "x": 2,
    "y": 1,
    "answer": "SEN",
    "direction": "across",
    "clue": "J.F.K.: 1953-61",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "John F. Kennedy",
    "wiki": "https://en.wikipedia.org/wiki/John_F._Kennedy",
    "description": "35th president of the United States"
  },
  {
    "x": 0,
    "y": 2,
    "answer": "DELTA",
    "direction": "across",
    "clue": "Welty's \"___ Wedding\"",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Eudora Welty",
    "wiki": "https://en.wikipedia.org/wiki/Eudora_Welty",
    "description": "American short story writer, novelist and photographer"
  },
  {
    "x": 0,
    "y": 2,
    "answer": "DON",
    "direction": "down",
    "clue": "Baseball player Sutton",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Don Sutton",
    "wiki": "https://en.wikipedia.org/wiki/Don_Sutton",
    "description": "American baseball player"
  },
  {
    "x": 1,
    "y": 2,
    "answer": "EDE",
    "direction": "down",
    "clue": "Basil ___, noted painter of birds",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Basil Ede",
    "wiki": "https://en.wikipedia.org/wiki/Basil_Ede",
    "description": "English artist (1931-2016)"
  },
  {
    "x": 0,
    "y": 3,
    "answer": "ODE",
    "direction": "across",
    "clue": "Pindar product",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Pindar",
    "wiki": "https://en.wikipedia.org/wiki/Pindar",
    "description": "Ancient Greek lyric poet from Thebes"
  },
  {
    "x": 0,
    "y": 4,
    "answer": "NERI",
    "direction": "across",
    "clue": "St. Philip ___",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Philip Neri",
    "wiki": "https://en.wikipedia.org/wiki/Philip_Neri",
    "description": "Italian Roman Catholic saint"
  }
]
```
  </file>
  <file path="samples/general/crossword-representation/pages/src/data/nyt1990s.json">
```json
[
  {
    "x": 1,
    "y": 0,
    "answer": "EGAN",
    "direction": "across",
    "clue": "Richard ___, actor from San Francisco",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Richard Egan",
    "wiki": "https://en.wikipedia.org/wiki/Richard_Egan_(actor)",
    "description": "American actor (1921-1987)"
  },
  {
    "x": 2,
    "y": 0,
    "answer": "GILDA",
    "direction": "down",
    "clue": "Hayworth title role",
    "race": "urm",
    "binaryRace": "white",
    "hispanic": "TRUE",
    "gender": "woman",
    "name": "Rita Hayworth",
    "wiki": "https://en.wikipedia.org/wiki/Rita_Hayworth",
    "description": "American actress, dancer and director (1918-1987)"
  },
  {
    "x": 3,
    "y": 0,
    "answer": "ARI",
    "direction": "down",
    "clue": "Jackie's second spouse",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Aristotle Onassis",
    "wiki": "https://en.wikipedia.org/wiki/Aristotle_Onassis",
    "description": "Greek shipping magnate"
  },
  {
    "x": 4,
    "y": 0,
    "answer": "NAN",
    "direction": "down",
    "clue": "Photographer Goldin",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Nan Goldin",
    "wiki": "https://en.wikipedia.org/wiki/Nan_Goldin",
    "description": "American photographer"
  },
  {
    "x": 2,
    "y": 1,
    "answer": "IRA",
    "direction": "across",
    "clue": "Novelist Levin",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Ira Levin",
    "wiki": "https://en.wikipedia.org/wiki/Ira_Levin",
    "description": "Novelist, playwright"
  },
  {
    "x": 0,
    "y": 2,
    "answer": "DOLIN",
    "direction": "across",
    "clue": "Dancer Anton",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Anton Dolin",
    "wiki": "https://en.wikipedia.org/wiki/Anton_Dolin",
    "description": "ballet dancer and choreographer (1904-1983)"
  },
  {
    "x": 0,
    "y": 2,
    "answer": "DEL",
    "direction": "down",
    "clue": "Sci-fi author Lester ___ Rey",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Lester del Rey",
    "wiki": "https://en.wikipedia.org/wiki/Lester_del_Rey",
    "description": "Novelist, short story writer, editor"
  },
  {
    "x": 1,
    "y": 2,
    "answer": "ODE",
    "direction": "down",
    "clue": "Wordsworth work",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "William Wordsworth",
    "wiki": "https://en.wikipedia.org/wiki/William_Wordsworth",
    "description": "English Romantic poet"
  },
  {
    "x": 0,
    "y": 3,
    "answer": "EDD",
    "direction": "across",
    "clue": "Actor Byrnes",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Edd Byrnes",
    "wiki": "https://en.wikipedia.org/wiki/Edd_Byrnes",
    "description": "American actor"
  },
  {
    "x": 0,
    "y": 4,
    "answer": "LEAR",
    "direction": "across",
    "clue": "The man behind Bunker",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Norman Lear",
    "wiki": "https://en.wikipedia.org/wiki/Norman_Lear",
    "description": "American television writer and producer"
  }
]
```
  </file>
  <file path="samples/general/crossword-representation/pages/src/data/nyt2000s.json">
```json
[
  {
    "x": 1,
    "y": 0,
    "answer": "MORT",
    "direction": "across",
    "clue": "Cartoonist Walker",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Mort Walker",
    "wiki": "https://en.wikipedia.org/wiki/Mort_Walker",
    "description": "American comic strip cartoonist"
  },
  {
    "x": 2,
    "y": 0,
    "answer": "OSHEA",
    "direction": "down",
    "clue": "Actor Milo",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Milo O'Shea",
    "wiki": "https://en.wikipedia.org/wiki/Milo_O%27Shea",
    "description": "Irish American actor (1926-2013)"
  },
  {
    "x": 3,
    "y": 0,
    "answer": "REA",
    "direction": "down",
    "clue": "Peggy of \"The Dukes of Hazzard\"",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Peggy Rea",
    "wiki": "https://en.wikipedia.org/wiki/Peggy_Rea",
    "description": "actress (1921-2011)"
  },
  {
    "x": 4,
    "y": 0,
    "answer": "TONI",
    "direction": "down",
    "clue": "Three-time skiing gold medalist ___ Sailer",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Toni Sailer",
    "wiki": "https://en.wikipedia.org/wiki/Toni_Sailer",
    "description": "Austrian alpine skier and actor"
  },
  {
    "x": 0,
    "y": 1,
    "answer": "DEMI",
    "direction": "down",
    "clue": "Actress Moore",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Demi Moore",
    "wiki": "https://en.wikipedia.org/wiki/Demi_Moore",
    "description": "American actress"
  },
  {
    "x": 2,
    "y": 1,
    "answer": "SEO",
    "direction": "across",
    "clue": "Former major-league pitcher Jae Weong ___",
    "race": "urm",
    "binaryRace": "poc",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Jae Weong Seo",
    "wiki": "https://en.wikipedia.org/wiki/Jae_Weong_Seo",
    "description": "South Korean baseball player"
  },
  {
    "x": 0,
    "y": 2,
    "answer": "ETHAN",
    "direction": "across",
    "clue": "Hawke of Hollywood",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Ethan Hawke",
    "wiki": "https://en.wikipedia.org/wiki/Ethan_Hawke",
    "description": "American actor and writer"
  },
  {
    "x": 1,
    "y": 2,
    "answer": "TOM",
    "direction": "down",
    "clue": "Author ___ Clancy",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Tom Clancy",
    "wiki": "https://en.wikipedia.org/wiki/Tom_Clancy",
    "description": "American author"
  },
  {
    "x": 0,
    "y": 3,
    "answer": "MOE",
    "direction": "across",
    "clue": "Stooge name",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Moe Howard",
    "wiki": "https://en.wikipedia.org/wiki/Moe_Howard",
    "description": "American actor and comedian"
  },
  {
    "x": 0,
    "y": 4,
    "answer": "IMAN",
    "direction": "across",
    "clue": "Mogadishu-born model",
    "race": "urm",
    "binaryRace": "poc",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Iman",
    "wiki": "https://en.wikipedia.org/wiki/Iman_(model)",
    "description": "Somali supermodel and entrepreneur"
  }
]
```
  </file>
  <file path="samples/general/crossword-representation/pages/src/data/nyt2010s.json">
```json
[
  {
    "x": 0,
    "y": 0,
    "answer": "SEGAR",
    "direction": "across",
    "clue": "Popeye creator E. C. ___",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "E. C. Segar",
    "wiki": "https://en.wikipedia.org/wiki/E._C._Segar",
    "description": "American cartoonist"
  },
  {
    "x": 2,
    "y": 0,
    "answer": "GILDA",
    "direction": "down",
    "clue": "Baba Wawa actress",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Gilda Radner",
    "wiki": "https://en.wikipedia.org/wiki/Gilda_Radner",
    "description": "American comedian and actress"
  },
  {
    "x": 3,
    "y": 0,
    "answer": "AVE",
    "direction": "down",
    "clue": "Caesar's greeting",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Julius Caesar",
    "wiki": "https://en.wikipedia.org/wiki/Julius_Caesar",
    "description": "Roman general and dictator"
  },
  {
    "x": 4,
    "y": 0,
    "answer": "RON",
    "direction": "down",
    "clue": "Presidential son Reagan",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Ron Reagan",
    "wiki": "https://en.wikipedia.org/wiki/Ron_Reagan",
    "description": "talk radio host and political analyst"
  },
  {
    "x": 2,
    "y": 1,
    "answer": "IVO",
    "direction": "across",
    "clue": "Pianist Pogorelich",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Ivo Pogorelić",
    "wiki": "https://en.wikipedia.org/wiki/Ivo_Pogoreli%C4%87",
    "description": "Croatian pianist"
  },
  {
    "x": 0,
    "y": 2,
    "answer": "ARLEN",
    "direction": "across",
    "clue": "Specter of the Senate, once",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Arlen Specter",
    "wiki": "https://en.wikipedia.org/wiki/Arlen_Specter",
    "description": "American politician; former United States Senator from Pennsylvania (1930-2012)"
  },
  {
    "x": 0,
    "y": 2,
    "answer": "ANA",
    "direction": "down",
    "clue": "Ortiz of \"Devious Maids\"",
    "race": "urm",
    "binaryRace": "white",
    "hispanic": "TRUE",
    "gender": "woman",
    "name": "Ana Ortiz",
    "wiki": "https://en.wikipedia.org/wiki/Ana_Ortiz",
    "description": "actress"
  },
  {
    "x": 1,
    "y": 2,
    "answer": "REN",
    "direction": "down",
    "clue": "Kylo ___, Adam Driver's role in \"Star Wars\"",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Adam Driver",
    "wiki": "https://en.wikipedia.org/wiki/Adam_Driver",
    "description": "American actor"
  },
  {
    "x": 0,
    "y": 3,
    "answer": "NED",
    "direction": "across",
    "clue": "\"Our Town\" opera composer",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Ned Rorem",
    "wiki": "https://en.wikipedia.org/wiki/Ned_Rorem",
    "description": "American composer (b1923)"
  },
  {
    "x": 0,
    "y": 4,
    "answer": "ANAIS",
    "direction": "across",
    "clue": "Who wrote \"We do not see things as they are, we see them as we are\"",
    "race": "urm",
    "binaryRace": "white",
    "hispanic": "TRUE",
    "gender": "woman",
    "name": "Anaïs Nin",
    "wiki": "https://en.wikipedia.org/wiki/Ana%C3%AFs_Nin",
    "description": "writer of novels, short stories."
  }
]
```
  </file>
  <file path="samples/general/crossword-representation/pages/src/data/nyt2020.json">
```json
[
  {
    "x": 2,
    "y": 0,
    "answer": "RAY",
    "direction": "across",
    "clue": "Dadaism pioneer",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Man Ray",
    "wiki": "https://en.wikipedia.org/wiki/Man_Ray",
    "description": "American artist and photographer"
  },
  {
    "x": 2,
    "y": 0,
    "answer": "RODIN",
    "direction": "down",
    "clue": "\"The Thinker\" sculptor",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Auguste Rodin",
    "wiki": "https://en.wikipedia.org/wiki/Auguste_Rodin",
    "description": "French sculptor"
  },
  {
    "x": 3,
    "y": 0,
    "answer": "ARI",
    "direction": "down",
    "clue": "Horror film director Aster",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Ari Aster",
    "wiki": "https://en.wikipedia.org/wiki/Ari_Aster",
    "description": "American filmmaker and screenwriter"
  },
  {
    "x": 4,
    "y": 0,
    "answer": "YANN",
    "direction": "down",
    "clue": "\"Life of Pi\" author Martel",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Yann Martel",
    "wiki": "https://en.wikipedia.org/wiki/Yann_Martel",
    "description": "Canadian author best known for the book Life of Pi"
  },
  {
    "x": 0,
    "y": 1,
    "answer": "ERMA",
    "direction": "down",
    "clue": "Bombeck who wrote \"I Lost Everything in the Post-Natal Depression\"",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Erma Bombeck",
    "wiki": "https://en.wikipedia.org/wiki/Erma_Bombeck",
    "description": "American humorist and writer"
  },
  {
    "x": 2,
    "y": 1,
    "answer": "ORA",
    "direction": "across",
    "clue": "Pop singer Rita",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Rita Ora",
    "wiki": "https://en.wikipedia.org/wiki/Rita_Ora",
    "description": "British singer and actress"
  },
  {
    "x": 0,
    "y": 2,
    "answer": "RIDIN",
    "direction": "across",
    "clue": "2006 #1 Chamillionaire hit that begins \"They see me rollin'\"",
    "race": "urm",
    "binaryRace": "poc",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Chamillionaire",
    "wiki": "https://en.wikipedia.org/wiki/Chamillionaire",
    "description": "American rapper, entrepreneur, and investor from Texas"
  },
  {
    "x": 1,
    "y": 2,
    "answer": "IAN",
    "direction": "down",
    "clue": "Novelist McEwan",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Ian McEwan",
    "wiki": "https://en.wikipedia.org/wiki/Ian_McEwan",
    "description": "British author"
  },
  {
    "x": 0,
    "y": 3,
    "answer": "MAI",
    "direction": "across",
    "clue": "Singer Ella with the 2018 Grammy-winning R&B hit \"Boo'd Up\"",
    "race": "urm",
    "binaryRace": "poc",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Ella Mai",
    "wiki": "https://en.wikipedia.org/wiki/Ella_Mai",
    "description": "English singer"
  },
  {
    "x": 0,
    "y": 4,
    "answer": "ANN",
    "direction": "across",
    "clue": "___ Petry, first female African-American writer with a million-selling novel (\"The Street\")",
    "race": "urm",
    "binaryRace": "poc",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Ann Petry",
    "wiki": "https://en.wikipedia.org/wiki/Ann_Petry",
    "description": "American writer and journalist"
  }
]
```
  </file>
  <file path="samples/general/crossword-representation/pages/src/data/up2020.json">
```json
[
  {
    "x": 1,
    "y": 0,
    "answer": "PELE",
    "direction": "across",
    "clue": "Soccer legend who wore No. 10",
    "race": "urm",
    "binaryRace": "poc",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Pelé",
    "wiki": "https://en.wikipedia.org/wiki/Pel%C3%A9",
    "description": "Brazilian footballer"
  },
  {
    "x": 2,
    "y": 0,
    "answer": "ELDER",
    "direction": "down",
    "clue": "Ancient Rome's Pliny the ___",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Pliny the Elder",
    "wiki": "https://en.wikipedia.org/wiki/Pliny_the_Elder",
    "description": "Roman military commander and writer"
  },
  {
    "x": 3,
    "y": 0,
    "answer": "LEE",
    "direction": "down",
    "clue": "\"Gemini Man\" director Ang",
    "race": "urm",
    "binaryRace": "poc",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Ang Lee",
    "wiki": "https://en.wikipedia.org/wiki/Ang_Lee",
    "description": "Taiwanese director, screenwriter and film producer"
  },
  {
    "x": 4,
    "y": 0,
    "answer": "EARP",
    "direction": "down",
    "clue": "Wyatt who worked in Dodge City",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Wyatt Earp",
    "wiki": "https://en.wikipedia.org/wiki/Wyatt_Earp",
    "description": "American gambler and frontier marshal"
  },
  {
    "x": 0,
    "y": 1,
    "answer": "CHER",
    "direction": "down",
    "clue": "One-named \"Goddess of Pop\"",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Cher",
    "wiki": "https://en.wikipedia.org/wiki/Cher",
    "description": "American singer, actress and television personality"
  },
  {
    "x": 2,
    "y": 1,
    "answer": "LEA",
    "direction": "across",
    "clue": "Michele of \"Glee\"",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Lea Michele",
    "wiki": "https://en.wikipedia.org/wiki/Lea_Michele",
    "description": "American actress, singer and author"
  },
  {
    "x": 0,
    "y": 2,
    "answer": "HADER",
    "direction": "across",
    "clue": "Portrayer of Barry on \"Barry\"",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Bill Hader",
    "wiki": "https://en.wikipedia.org/wiki/Bill_Hader",
    "description": "American actor, comedian, writer, and producer"
  },
  {
    "x": 1,
    "y": 2,
    "answer": "ARI",
    "direction": "down",
    "clue": "\"Boyfriend\" singer Grande, to fans",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Ariana Grande",
    "wiki": "https://en.wikipedia.org/wiki/Ariana_Grande",
    "description": "American singer and actress"
  },
  {
    "x": 0,
    "y": 3,
    "answer": "ERE",
    "direction": "across",
    "clue": "Before, to Dickinson",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Emily Dickinson",
    "wiki": "https://en.wikipedia.org/wiki/Emily_Dickinson",
    "description": "American poet (1830-1886)"
  },
  {
    "x": 0,
    "y": 4,
    "answer": "RIRI",
    "direction": "across",
    "clue": "\"Umbrella\" singer's nickname",
    "race": "urm",
    "binaryRace": "poc",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Rihanna",
    "wiki": "https://en.wikipedia.org/wiki/Rihanna",
    "description": "Barbadian singer, songwriter, businesswoman, and philanthropist"
  }
]
```
  </file>
  <file path="samples/general/crossword-representation/pages/src/data/usa2020.json">
```json
[
  {
    "x": 0,
    "y": 0,
    "answer": "TRACE",
    "direction": "across",
    "clue": "\"Hustlers\" actress Lysette",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Trace Lysette",
    "wiki": "https://en.wikipedia.org/wiki/Trace_Lysette",
    "description": "American actor"
  },
  {
    "x": 2,
    "y": 0,
    "answer": "ANITA",
    "direction": "down",
    "clue": "Rita's role in \"West Side Story\"",
    "race": "urm",
    "binaryRace": "white",
    "hispanic": "TRUE",
    "gender": "woman",
    "name": "Rita Moreno",
    "wiki": "https://en.wikipedia.org/wiki/Rita_Moreno",
    "description": "Puerto Rican singer, dancer, and actress"
  },
  {
    "x": 3,
    "y": 0,
    "answer": "CHE",
    "direction": "down",
    "clue": "Guerrilla Guevara",
    "race": "urm",
    "binaryRace": "white",
    "hispanic": "TRUE",
    "gender": "man",
    "name": "Che Guevara",
    "wiki": "https://en.wikipedia.org/wiki/Che_Guevara",
    "description": "Argentine Marxist revolutionary"
  },
  {
    "x": 4,
    "y": 0,
    "answer": "ELL",
    "direction": "down",
    "clue": "\"I Don't Love You\" singer Lindsay",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Lindsay Ell",
    "wiki": "https://en.wikipedia.org/wiki/Lindsay_Ell",
    "description": "Canadian musician"
  },
  {
    "x": 2,
    "y": 1,
    "answer": "NHL",
    "direction": "across",
    "clue": "Willie O'Ree played in it (Abbr.)",
    "race": "urm",
    "binaryRace": "poc",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Willie O'Ree",
    "wiki": "https://en.wikipedia.org/wiki/Willie_O%27Ree",
    "description": "20th-century Canadian ice hockey player"
  },
  {
    "x": 0,
    "y": 2,
    "answer": "ARIEL",
    "direction": "across",
    "clue": "\"Modern Family\" actress Winter",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Ariel Winter",
    "wiki": "https://en.wikipedia.org/wiki/Ariel_Winter",
    "description": "American actress, model and occasional singer"
  },
  {
    "x": 0,
    "y": 2,
    "answer": "ALI",
    "direction": "down",
    "clue": "Broadway star Stroker",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Ali Stroker",
    "wiki": "https://en.wikipedia.org/wiki/Ali_Stroker",
    "description": "American actress"
  },
  {
    "x": 1,
    "y": 2,
    "answer": "REC",
    "direction": "down",
    "clue": "\"Parks and ___\" (Amy Poehler sitcom, for short)",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Amy Poehler",
    "wiki": "https://en.wikipedia.org/wiki/Amy_Poehler",
    "description": "American actress"
  },
  {
    "x": 0,
    "y": 3,
    "answer": "LET",
    "direction": "across",
    "clue": "\"___ America Be America Again\" (Langston Hughes poem)",
    "race": "urm",
    "binaryRace": "poc",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Langston Hughes",
    "wiki": "https://en.wikipedia.org/wiki/Langston_Hughes",
    "description": "American writer and social activist"
  },
  {
    "x": 0,
    "y": 4,
    "answer": "ICARE",
    "direction": "across",
    "clue": "Beyonce song about emotional investment",
    "race": "urm",
    "binaryRace": "poc",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Beyoncé",
    "wiki": "https://en.wikipedia.org/wiki/Beyonc%C3%A9",
    "description": "American singer, songwriter, producer, and actress"
  }
]
```
  </file>
  <file path="samples/general/crossword-representation/pages/src/data/wsj2020.json">
```json
[
  {
    "x": 0,
    "y": 0,
    "answer": "QUINN",
    "direction": "across",
    "clue": "\"Elementary\" actor Aidan",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Aidan Quinn",
    "wiki": "https://en.wikipedia.org/wiki/Aidan_Quinn",
    "description": "American actor"
  },
  {
    "x": 2,
    "y": 0,
    "answer": "IRENE",
    "direction": "down",
    "clue": "Marie Curie's scientist daughter",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Irène Joliot-Curie",
    "wiki": "https://en.wikipedia.org/wiki/Ir%C3%A8ne_Joliot-Curie",
    "description": "French scientist"
  },
  {
    "x": 3,
    "y": 0,
    "answer": "NAS",
    "direction": "down",
    "clue": "Lil ___ X (\"Rodeo\" rapper)",
    "race": "urm",
    "binaryRace": "poc",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Lil Nas X",
    "wiki": "https://en.wikipedia.org/wiki/Lil_Nas_X",
    "description": "American rapper, singer, and songwriter from Georgia"
  },
  {
    "x": 4,
    "y": 0,
    "answer": "NYE",
    "direction": "down",
    "clue": "Bill of scientific information",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Bill Nye",
    "wiki": "https://en.wikipedia.org/wiki/Bill_Nye",
    "description": "American science educator, comedian, television host, actor, writer, scientist and former mechanical engineer"
  },
  {
    "x": 2,
    "y": 1,
    "answer": "RAY",
    "direction": "across",
    "clue": "Kroc who's the subject of the 2016 biopic \"The Founder\"",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Ray Kroc",
    "wiki": "https://en.wikipedia.org/wiki/Ray_Kroc",
    "description": "American businessman"
  },
  {
    "x": 0,
    "y": 2,
    "answer": "REESE",
    "direction": "across",
    "clue": "She played June to Joaquin's Johnny",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Reese Witherspoon",
    "wiki": "https://en.wikipedia.org/wiki/Reese_Witherspoon",
    "description": "American actress and producer"
  },
  {
    "x": 0,
    "y": 2,
    "answer": "RAP",
    "direction": "down",
    "clue": "Drake's forte",
    "race": "urm",
    "binaryRace": "poc",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Drake",
    "wiki": "https://en.wikipedia.org/wiki/Drake_(musician)",
    "description": "Canadian rapper, singer, songwriter, and actor"
  },
  {
    "x": 1,
    "y": 2,
    "answer": "ENO",
    "direction": "down",
    "clue": "Musician who composed the Windows 95 start-up chime",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Brian Eno",
    "wiki": "https://en.wikipedia.org/wiki/Brian_Eno",
    "description": "English musician, composer, record producer and visual artist"
  },
  {
    "x": 0,
    "y": 3,
    "answer": "ANN",
    "direction": "across",
    "clue": "\"Bel Canto\" author Patchett",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "woman",
    "name": "Ann Patchett",
    "wiki": "https://en.wikipedia.org/wiki/Ann_Patchett",
    "description": "American novelist and memoirist"
  },
  {
    "x": 0,
    "y": 4,
    "answer": "POEMS",
    "direction": "across",
    "clue": "Frost lines",
    "race": "white",
    "binaryRace": "white",
    "hispanic": "FALSE",
    "gender": "man",
    "name": "Robert Frost",
    "wiki": "https://en.wikipedia.org/wiki/Robert_Frost",
    "description": "American poet"
  }
]
```
  </file>
  <file path="samples/general/crossword-representation/pages/src/main.js">
```javascript
import App from './App.svelte';new App({target:document.querySelector('#app')});
let hadCompletion=false;
function accessible(){document.querySelectorAll('.cell').forEach(e=>{const pos=e.getAttribute('transform').match(/[\d.]+/g),value=e.querySelector('.value')?.textContent.trim()||'blank';e.setAttribute('role','button');e.setAttribute('aria-label',`Row ${+pos[1]+1}, column ${+pos[0]+1}, ${value}`)});document.querySelectorAll('.bar button').forEach((e,i)=>e.setAttribute('aria-label',i?'Next clue':'Previous clue'));const complete=document.querySelector('.completed');if(complete&&!hadCompletion)complete.querySelector('button')?.focus();if(!complete&&hadCompletion)document.querySelector('select')?.focus();hadCompletion=!!complete;}
new MutationObserver(accessible).observe(document.querySelector('#app'),{childList:true,subtree:true});accessible();
addEventListener('keydown',e=>{if(e.key==='Escape'){const b=document.querySelector('.completed button');if(b)b.click();document.querySelector('select')?.focus();}});
```
  </file>
  <file path="samples/general/crossword-representation/pages/src/utils/loadData.js">
```javascript
import usa2020 from "../data/usa2020.json";
import up2020 from "../data/up2020.json";
import nyt2020 from "../data/nyt2020.json";
import wsj2020 from "../data/wsj2020.json";
import lat2020 from "../data/lat2020.json";

import nyt1940s from "../data/nyt1940s.json";
import nyt1950s from "../data/nyt1950s.json";
import nyt1960s from "../data/nyt1960s.json";
import nyt1970s from "../data/nyt1970s.json";
import nyt1980s from "../data/nyt1980s.json";
import nyt1990s from "../data/nyt1990s.json";
import nyt2000s from "../data/nyt2000s.json";
import nyt2010s from "../data/nyt2010s.json";

const puzzlesToday = [
	{
		id: "lat2020",
		value: "LA Times",
		data: lat2020,
		urm: "25%",
		white: "75%",
		woman: "32%",
		man: "68%",
	},
	{
		id: "nyt2020",
		value: "New York Times",
		data: nyt2020,
		urm: "28%",
		white: "72%",
		woman: "36%",
		man: "64%",
	},
	{
		id: "up2020",
		value: "Universal",
		data: up2020,
		urm: "29%",
		white: "71%",
		woman: "46%",
		man: "54%",
	},
	{
		id: "usa2020",
		value: "USA Today",
		data: usa2020,
		urm: "48%",
		white: "52%",
		woman: "72%",
		man: "28%",
	},
	{
		id: "wsj2020",
		value: "Wall Street Journal",
		data: wsj2020,
		urm: "24%",
		white: "76%",
		woman: "31%",
		man: "69%",
	},
];

const puzzlesNYT = [
	{
		id: "nyt1940s",
		value: "1940s",
		data: nyt1940s,
		urm: "6%",
		white: "94%",
		woman: "10%",
		man: "90%",
	},
	{
		id: "nyt1950s",
		value: "1950s",
		data: nyt1950s,
		urm: "9%",
		white: "91%",
		woman: "16%",
		man: "84%",
	},
	{
		id: "nyt1960s",
		value: "1960s",
		data: nyt1960s,
		urm: "7%",
		white: "93%",
		woman: "15%",
		man: "85%",
	},
	{
		id: "nyt1970s",
		value: "1970s",
		data: nyt1970s,
		urm: "9%",
		white: "91%",
		woman: "20%",
		man: "80%",
	},
	{
		id: "nyt1980s",
		value: "1980s",
		data: nyt1980s,
		urm: "7%",
		white: "93%",
		woman: "17%",
		man: "83%",
	},
	{
		id: "nyt1990s",
		value: "1990s",
		data: nyt1990s,
		urm: "11%",
		white: "89%",
		woman: "22%",
		man: "78%",
	},
	{
		id: "nyt2000s",
		value: "2000s",
		data: nyt2000s,
		urm: "15%",
		white: "85%",
		woman: "28%",
		man: "72%",
	},
	{
		id: "nyt2010s",
		value: "2010s",
		data: nyt2010s,
		urm: "25%",
		white: "75%",
		woman: "27%",
		man: "73%",
	},
];

export { puzzlesNYT, puzzlesToday };
```
  </file>
  <file path="samples/general/crossword-representation/pages/style.css">
```css
*{box-sizing:border-box}body{margin:0}main{max-width:1120px;margin:auto;padding:28px 36px}header{display:flex;justify-content:space-between;gap:20px;font-size:12px;border-bottom:1px solid #bbb;padding-bottom:20px}.intro{max-width:780px;margin:36px auto;text-align:center}.intro h1{font-size:54px;line-height:1.1;margin:14px 0}.intro p{font-size:19px;line-height:1.55}.intro .eyebrow{font-size:12px;letter-spacing:1.5px}.intro .credit{font-size:13px;color:#555}nav{display:flex;justify-content:center;gap:12px;margin-bottom:24px}nav button{padding:10px 18px;background:#f1f1f1}.chosen{background:#1a1a1a;color:#fff}button:focus-visible,select:focus-visible,a:focus-visible,summary:focus-visible{outline:3px solid #4864fe;outline-offset:3px}select{padding:6px 10px;background:#fff;border:1px solid #aaa}#puzzle{margin-top:24px;margin-bottom:40px}.correction{font-size:13px;text-align:center;max-width:660px;margin:10px auto;color:#555}footer{max-width:800px;margin:auto;padding:22px 0;border-top:1px solid #bbb;font-size:14px}footer p{line-height:1.6}summary{cursor:pointer}.xd .cell{cursor:pointer}@media(max-width:639px){main{padding:20px 16px}header{font-size:10px}.intro{margin:26px auto}.intro h1{font-size:39px}.intro p{font-size:17px}.intro .credit{font-size:12px}nav{gap:8px}nav button{font-size:14px;padding:10px}#puzzle h2{font-size:25px}.intro .eyebrow{font-size:10px;letter-spacing:1px}}
```
  </file>
  <file path="samples/general/crossword-representation/pages/vendor/svelte-crossword/README.md">
```text
# Crossword mechanism source

This is the unmodified `src/` of `svelte-crossword@0.3.4`, the dependency imported by `src/components/Play.svelte`. It is included here for model-readable reference; the runnable page still uses its existing compiled build and locked npm dependency.

- `Crossword.svelte`: shared cells and clues, correctness, Clear / Reveal / Check, and completion.
- `Puzzle.svelte`: cell updates, focus movement and undo/redo state history.
- `Cell.svelte`: keyboard events, cell rendering and incorrect-answer feedback.
- `helpers/`: grid construction, crossing-word constraints and navigation.

The generic Svelte runtime and `svelte-keyboard@0.2.0` remain package dependencies. The latter supplies the on-screen keyboard; its event consumer and the crossword state updates are included in `Puzzle.svelte`.

Source: https://github.com/russellgoldenberg/svelte-crossword
Package: https://registry.npmjs.org/svelte-crossword/-/svelte-crossword-0.3.4.tgz
Archive integrity (matches this sample's package-lock.json): `sha512-9yP40NkHNrLVAPSov0UQ8JTvVBheLi/eoZ7siI1zOaFP61wDAIfngPMj6njpxOLQM5pfFyPaVn06RSlzi6cvhw==`.
MIT license: see `LICENSE`.
```
  </file>
  <file path="samples/general/crossword-representation/pages/vendor/svelte-crossword/LICENSE">
```text
MIT License

Copyright (c) 2020 Russell Goldenberg

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```
  </file>
  <file path="samples/general/crossword-representation/pages/vendor/svelte-crossword/src/Cell.svelte">
```svelte
<script>
  export let x;
  export let y;
  export let value;
  export let answer;
  export let number;
  export let index;
  export let custom;
  export let changeDelay = 0;
  export let isRevealing = false;
  export let isChecking = false;
  export let isFocused = false;
  export let isSecondarilyFocused = false;
  export let onFocusCell = () => {};
  export let onCellUpdate = () => {};
  export let onFocusClueDiff = () => {};
  export let onMoveFocus = () => {};
  export let onFlipDirection = () => {};
  export let onHistoricalChange = () => {};

  let element;

  $: isFocused, onFocusSelf();
  $: correct = answer === value;
  $: showCheck = isChecking && value;

  function onFocusSelf() {
    if (!element) return;
    if (isFocused) element.focus();
  }

  function onKeydown(e) {
    if (e.ctrlKey && e.key.toLowerCase() == "z") {
      onHistoricalChange(e.shiftKey ? 1 : -1);
    }

    if (e.ctrlKey) return;
    if (e.altKey) return;

    if (e.key === "Tab") {
      onFocusClueDiff(e.shiftKey ? -1 : 1);
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (e.key == " ") {
      onFlipDirection();
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (["Delete", "Backspace"].includes(e.key)) {
      onCellUpdate(index, "", -1, true);
      return;
    }

    const isKeyInAlphabet = /^[a-zA-Z()]$/.test(e.key);
    if (isKeyInAlphabet) {
      onCellUpdate(index, e.key.toUpperCase());
      return;
    }

    const diff = {
      ArrowLeft: ["across", -1],
      ArrowRight: ["across", 1],
      ArrowUp: ["down", -1],
      ArrowDown: ["down", 1],
    }[e.key];
    if (diff) {
      onMoveFocus(...diff);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
  }

  function onClick() {
    onFocusCell(index);
  }

  function pop(node, { delay = 0, duration = 250 }) {
    return {
      delay,
      duration,
      css: (t) =>
        [
          `transform: translate(0, ${1 - t}px)`, //
        ].join(";"),
    };
  }
</script>

<g
  class="cell {custom} cell-{x}-{y}"
  class:is-focused="{isFocused}"
  class:is-secondarily-focused="{isSecondarilyFocused}"
  class:is-correct="{showCheck && correct}"
  class:is-incorrect="{showCheck && !correct}"
  transform="{`translate(${x}, ${y})`}"
  tabIndex="0"
  on:click="{onClick}"
  on:keydown="{onKeydown}"
  bind:this="{element}">
  <rect width="1" height="1"></rect>

  {#if showCheck && !correct}
    <line x1="0" y1="1" x2="1" y2="0"></line>
  {/if}

  {#if value}
    <text
      transition:pop="{{ y: 5, delay: changeDelay, duration: isRevealing ? 250 : 0 }}"
      class="value"
      x="0.5"
      y="0.9"
      text-anchor="middle">
      {value}
    </text>
  {/if}
  <text class="number" x="0.08" y="0.3" text-anchor="start">{number}</text>
</g>

<style>
  g {
    cursor: pointer;
    user-select: none;
  }

  g:focus {
    outline: none;
  }

  g.is-secondarily-focused rect {
    fill: var(--secondary-highlight-color);
  }

  g.is-focused rect {
    fill: var(--primary-highlight-color);
  }

  text {
    pointer-events: none;
    line-height: 1;
    font-family: var(--font);
    fill: var(--main-color);
  }

  .value {
    font-size: 0.7em;
    font-weight: 400;
  }

  .number {
    font-size: 0.3em;
    font-weight: 400;
    fill: var(--main-color);
    opacity: 0.5;
  }

  rect {
    fill: var(--bg-color);
    stroke: var(--main-color);
    stroke-width: 0.01em;
    transition: fill 0.1s ease-out;
  }

  line {
    stroke: var(--main-color);
    stroke-width: 0.02em;
  }
</style>
```
  </file>
  <file path="samples/general/crossword-representation/pages/vendor/svelte-crossword/src/Clue.svelte">
```svelte
<script>
  import scrollTo from "./helpers/scrollTo.js";

  export let number;
  export let clue;
  export let custom;
  export let isFilled;
  export let isNumberFocused = false;
  export let isDirectionFocused = false;
  export let isDisableHighlight = false;
  export let onFocus = () => {};

  let element;

  $: isFocused = isNumberFocused;
</script>

<li bind:this="{element}" use:scrollTo="{isFocused}">
  <button
    class="clue {custom}"
    class:is-disable-highlight="{isDisableHighlight}"
    class:is-number-focused="{isNumberFocused}"
    class:is-direction-focused="{isDirectionFocused}"
    class:is-filled="{isFilled}"
    on:click="{onFocus}">
    <strong>{number}</strong>
    {clue}
  </button>
</li>

<style>
  button {
    display: flex;
    width: 100%;
    background: none;
    text-align: left;
    appearance: none;
    outline: none;
    border: none;
    border-left: 6px solid transparent;
    padding: 0.5em;
    cursor: pointer;
    line-height: 1.325;
    color: var(--main-color);
    font-family: var(--font);
    font-size: 1em;
    cursor: pointer;
  }

  strong {
    min-width: 1.25em;
    display: inline-block;
    text-align: right;
    margin-right: 0.5em;
  }

  .clue:focus:not(.is-disable-highlight) {
    border-color: var(--secondary-highlight-color);
  }
  .is-number-focused:not(.is-disable-highlight) {
    border-left-color: var(--secondary-highlight-color);
  }
  .is-number-focused.is-direction-focused:not(.is-disable-highlight) {
    background: var(--secondary-highlight-color);
  }
  .is-filled {
    opacity: 0.5;
  }
</style>
```
  </file>
  <file path="samples/general/crossword-representation/pages/vendor/svelte-crossword/src/ClueBar.svelte">
```svelte
<script>
  import { createEventDispatcher } from "svelte";
  const dispatch = createEventDispatcher();

  export let currentClue = {};
  $: clue = currentClue["clue"];
  $: custom = currentClue["custom"] || "";
</script>

<div class="bar {custom}">
  <button on:click="{() => dispatch('nextClue', currentClue.index - 1)}">
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="feather feather-chevron-left">
      <polyline points="15 18 9 12 15 6"></polyline>
    </svg>
  </button>
  <p>{clue}</p>
  <button on:click="{() => dispatch('nextClue', currentClue.index + 1)}">
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="feather feather-chevron-right">
      <polyline points="9 18 15 12 9 6"></polyline>
    </svg>
  </button>
</div>

<style>
  .bar {
    width: 100%;
    display: flex;
    justify-content: space-between;
    background-color: var(--secondary-highlight-color);
    align-items: center;
  }

  p {
    padding: 0 1em;
    line-height: 1.325;
    font-family: var(--font);
  }

  button {
    cursor: pointer;
    font-size: 1em;
    border: none;
    line-height: 1;
    color: var(--main-color);
    background-color: transparent;
  }
</style>
```
  </file>
  <file path="samples/general/crossword-representation/pages/vendor/svelte-crossword/src/ClueList.svelte">
```svelte
<script>
  import Clue from "./Clue.svelte";

  export let direction;
  export let clues;
  export let focusedClueNumbers;
  export let isDirectionFocused;
  export let onClueFocus;
  export let isDisableHighlight;
</script>

<p>{direction}</p>
<div class="list">
  <ul>
    {#each clues as clue}
      <Clue
        clue="{clue.clue}"
        number="{clue.number}"
        custom="{clue.custom}"
        isFilled="{clue.isFilled}"
        isNumberFocused="{focusedClueNumbers[direction] === clue.number}"
        isDirectionFocused="{isDirectionFocused}"
        isDisableHighlight="{isDisableHighlight}"
        onFocus="{() => onClueFocus(clue)}" />
    {/each}
  </ul>
</div>

<style>
  .list {
    position: relative;
    max-height: 45vh;
    margin-bottom: 2em;
    overflow: auto;
  }

  p {
    font-family: var(--font);
    color: var(--main-color);
    font-weight: 700;
    text-transform: uppercase;
    padding-left: calc(2.5em + 6px);
    padding-bottom: 0.5em;
    font-size: 0.85em;
    border-bottom: 1px solid var(--accent-color);
    margin: 0;
  }

  ul {
    list-style-type: none;
    padding-left: 0;
    margin: 0;
    margin-top: 1em;
  }

  ::-moz-scrollbar {
    width: 9px;
  }
  ::-webkit-scrollbar {
    width: 9px;
  }

  ::-moz-scrollbar-track {
    box-shadow: none;
    border-radius: 8px;
    background-color: var(--accent-color);
  }
  ::-webkit-scrollbar-track {
    box-shadow: none;
    border-radius: 8px;
    background-color: var(--accent-color);
  }
  ::scrollbar-thumb {
    border-radius: 8px;
    background-color: var(--scrollbar-color);
    box-shadow: none;
  }
  ::-moz-scrollbar-thumb {
    background-color: var(--scrollbar-color);
    border-radius: 6px;
  }
  ::-webkit-scrollbar-thumb {
    background-color: var(--scrollbar-color);
    border-radius: 6px;
  }
</style>
```
  </file>
  <file path="samples/general/crossword-representation/pages/vendor/svelte-crossword/src/Clues.svelte">
```svelte
<script>
  import ClueList from "./ClueList.svelte";
  import ClueBar from "./ClueBar.svelte";

  export let clues;
  export let cellIndexMap;
  export let focusedDirection;
  export let focusedCellIndex;
  export let focusedCell;
  export let stacked;
  export let isDisableHighlight;
  export let isLoaded;

  $: focusedClueNumbers = focusedCell.clueNumbers || {};
  $: currentClue =
    clues.find(
      c =>
        c.direction === focusedDirection &&
        c.number === focusedClueNumbers[focusedDirection]
    ) || {};

  function onClueFocus({ direction, id }) {
    focusedDirection = direction;
    focusedCellIndex = cellIndexMap[id] || 0;
  }

  function onNextClue({ detail }) {
    let next = detail;
    if (next < 0) next = clues.length - 1;
    else if (next > clues.length - 1) next = 0;
    const { direction, id } = clues[next];
    onClueFocus({ direction, id });
  }
</script>

<section class="clues" class:stacked class:is-loaded="{isLoaded}">
  <div class="clues--stacked">
    <ClueBar {currentClue} on:nextClue="{onNextClue}" />
  </div>

  <div class="clues--list">
    {#each ['across', 'down'] as direction}
      <ClueList
        {direction}
        {focusedClueNumbers}
        clues="{clues.filter(d => d.direction === direction)}"
        isDirectionFocused="{focusedDirection === direction}"
        {isDisableHighlight}
        {onClueFocus} />
    {/each}
  </div>
</section>

<style>
  section {
    position: sticky;
    top: 1em;
    flex: 0 1 16em;
    height: fit-content;
    margin: 0;
    margin-right: 1em;
  }

  section.is-loaded.stacked {
    position: static;
    height: auto;
    top: auto;
    display: block;
    margin: 1em 0;
    flex: auto;
  }

  .clues--stacked {
    margin: 0;
    display: none;
  }

  .is-loaded.stacked .clues--stacked {
    display: block;
  }

  .is-loaded.stacked .clues--list {
    display: none;
  }

  @media only screen and (max-width: 720px) {
    section:not(.is-loaded) {
      position: static;
      height: auto;
      top: auto;
      display: block;
      margin: 1em 0;
      flex: auto;
    }

    .clues--stacked:not(.is-loaded) {
      display: block;
    }

    .clues--list:not(.is-loaded) {
      display: none;
    }
  }
</style>
```
  </file>
  <file path="samples/general/crossword-representation/pages/vendor/svelte-crossword/src/CompletedMessage.svelte">
```svelte
<script>
  import { fade } from "svelte/transition";
  import Confetti from "./Confetti.svelte";

  export let showConfetti = true;

  let isOpen = true;
</script>

{#if isOpen}
  <div class="completed" transition:fade="{{ y: 20 }}">
    <div class="content">
      <div class="message">
        <slot />
      </div>

      <button on:click="{() => (isOpen = false)}">View puzzle</button>
    </div>

    {#if showConfetti}
      <div class="confetti">
        <Confetti />
      </div>
    {/if}
  </div>
  <div
    class="curtain"
    transition:fade="{{ duration: 250 }}"
    on:click="{() => (isOpen = false)}"></div>
{/if}

<style>
  .completed {
    position: absolute;
    top: min(50%, 15em);
    left: 50%;
    background-color: var(--bg-color);
    transform: translate(-50%, -50%);
    border-radius: 4px;
    z-index: 100;
    box-shadow: 0 4px 8px 4px rgba(0, 0, 0, 0.2);
    font-family: var(--font);
  }

  .curtain {
    position: absolute;
    top: 0;
    right: -2px;
    bottom: 0;
    left: 0;
    background-color: var(--bg-color);
    opacity: 0.9;
    cursor: pointer;
    z-index: 1;
  }

  button {
    cursor: pointer;
    margin-left: 1em;
    font-size: 1em;
    font-family: var(--font);
    background-color: var(--accent-color);
    border-radius: 4px;
    color: var(--main-color);
    padding: 0.75em;
    border: none;
    font-weight: 400;
    transition: background-color 150ms;
  }

  button:hover {
    background-color: var(--secondary-highlight-color);
  }

  .content {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2em;
  }

  .message {
    margin-bottom: 1em;
  }

  .confetti {
    position: absolute;
    top: 30%;
    left: 50%;
    transform: translate(-50%, -50%);
  }
</style>
```
  </file>
  <file path="samples/general/crossword-representation/pages/vendor/svelte-crossword/src/Confetti.svelte">
```svelte
<script>
  import { quadIn } from "svelte/easing";

  export let numberOfElements = 50;
  export let durationInSeconds = 2;
  export let colors = [
    "#fff",
    "#c7ecee",
    "#778beb",
    "#f7d794",
    "#63cdda",
    "#cf6a87",
    "#e77f67",
    "#786fa6",
    "#FDA7DF",
    "#4b7bec",
    "#475c83",
  ];

  const pickFrom = (arr) => arr[Math.round(Math.random() * arr.length)];
  const randomNumber = (min, max) => Math.random() * (max - min) + min;
  const getManyOf = (str) => new Array(30).fill(0).map(() => str);

  const elementOptions = [
    ...getManyOf(`<circle r="3" />`),
    ...getManyOf(
      `<path d="M3.83733 4.73234C4.38961 4.73234 4.83733 4.28463 4.83733 3.73234C4.83733 3.18006 4.38961 2.73234 3.83733 2.73234C3.28505 2.73234 2.83733 3.18006 2.83733 3.73234C2.83733 4.28463 3.28505 4.73234 3.83733 4.73234ZM3.83733 6.73234C5.49418 6.73234 6.83733 5.38919 6.83733 3.73234C6.83733 2.07549 5.49418 0.732341 3.83733 0.732341C2.18048 0.732341 0.83733 2.07549 0.83733 3.73234C0.83733 5.38919 2.18048 6.73234 3.83733 6.73234Z" />`
    ),
    ...getManyOf(
      `<path d="M4.29742 2.26041C3.86864 2.1688 3.20695 2.21855 2.13614 3.0038C1.69078 3.33041 1.06498 3.23413 0.738375 2.78876C0.411774 2.3434 0.508051 1.7176 0.953417 1.39099C2.32237 0.387097 3.55827 0.0573281 4.71534 0.304565C5.80081 0.536504 6.61625 1.24716 7.20541 1.78276C7.28295 1.85326 7.35618 1.92051 7.4263 1.9849C7.64841 2.18888 7.83929 2.36418 8.03729 2.52315C8.29108 2.72692 8.48631 2.8439 8.64952 2.90181C8.7915 2.95219 8.91895 2.96216 9.07414 2.92095C9.24752 2.8749 9.5134 2.7484 9.88467 2.42214C10.2995 2.05757 10.9314 2.09833 11.2959 2.51319C11.6605 2.92805 11.6198 3.5599 11.2049 3.92447C10.6816 4.38435 10.1478 4.70514 9.58752 4.85394C9.00909 5.00756 8.469 4.95993 7.9807 4.78667C7.51364 4.62093 7.11587 4.34823 6.78514 4.08268C6.53001 3.87783 6.27248 3.64113 6.04114 3.4285C5.97868 3.37109 5.91814 3.31544 5.86006 3.26264C5.25645 2.7139 4.79779 2.36733 4.29742 2.26041Z" />`
    ),
    ...getManyOf(`<rect width="4" height="4" x="-2" y="-2" />`),
    `<path d="M -5 5 L 0 -5 L 5 5 Z" />`,
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"
      .split("")
      .map((letter) => `<text style="font-weight: 700">${letter}</text>`),
  ];

  const allElements = new Array(numberOfElements)
    .fill(0)
    .map((_, i) => [pickFrom(elementOptions), pickFrom(colors), Math.random()]);
</script>

<svg class="confetti" viewBox="-10 -10 10 10">
  {#each allElements as [element, color, scale], i}
    <g style="transform: scale({scale})">
      <g
        fill="{color}"
        style="{[`--rotation: ${Math.random() * 360}deg`, `animation-delay: ${quadIn(i / numberOfElements)}s`, `animation-duration: ${durationInSeconds * randomNumber(0.7, 1)}s`].join(';')}">
        {@html element}
      </g>
    </g>
  {/each}
</svg>

<style>
  .confetti {
    width: 2em;
    position: absolute;
    stroke-linecap: round;
    stroke-linejoin: round;
    fill-rule: evenodd;
    clip-rule: evenodd;
    pointer-events: none;
    overflow: visible;
    transform: translate(-50%, -50%);
  }
  @keyframes pop {
    0% {
      transform: rotate(var(--rotation)) scale(1) translate(0em, 0em);
    }
    100% {
      transform: rotate(calc(var(--rotation) + 60deg)) scale(0)
        translate(9em, 9em);
      fill: white;
    }
  }
  g {
    transition: all 0.5s ease-out;
    transform: rotate(var(--rotation)) scale(0) translate(0, 0);
    animation: pop 2s ease-out;
    animation-iteration-count: infinite;
  }
</style>
```
  </file>
  <file path="samples/general/crossword-representation/pages/vendor/svelte-crossword/src/Crossword.svelte">
```svelte
<script>
  import { onMount } from "svelte";
  import Toolbar from "./Toolbar.svelte";
  import Puzzle from "./Puzzle.svelte";
  import Clues from "./Clues.svelte";
  import CompletedMessage from "./CompletedMessage.svelte";
  import createClues from "./helpers/createClues.js";
  import createCells from "./helpers/createCells.js";
  import validateClues from "./helpers/validateClues.js";
  import { fromPairs } from "./helpers/utils.js";
  import themeStyles from "./helpers/themeStyles.js";

  export let data = [];
  export let actions = ["clear", "reveal", "check"];
  export let theme = "classic";
  export let revealDuration = 1000;
  export let breakpoint = 720;
  export let revealed = false;
  export let disableHighlight = false;
  export let showCompleteMessage = true;
  export let showConfetti = true;
  export let showKeyboard;
  export let keyboardStyle = "outline";

  let width = 0;
  let focusedDirection = "across";
  let focusedCellIndex = 0;
  let isRevealing = false;
  let isLoaded = false;
  let isChecking = false;
  let revealTimeout;
  let clueCompletion;

  let originalClues = [];
  let validated = [];
  let clues = [];
  let cells = [];

  const onDataUpdate = () => {
    originalClues = createClues(data);
    validated = validateClues(originalClues);
    clues = originalClues.map((d) => ({ ...d }));
    cells = createCells(originalClues);
    reset();
  };

  $: data, onDataUpdate();
  $: focusedCell = cells[focusedCellIndex] || {};
  $: cellIndexMap = fromPairs(cells.map((cell) => [cell.id, cell.index]));
  $: percentCorrect =
    cells.filter((d) => d.answer === d.value).length / cells.length;
  $: isComplete = percentCorrect == 1;
  $: isDisableHighlight = isComplete && disableHighlight;
  $: cells, (clues = checkClues());
  $: cells, (revealed = !clues.filter((d) => !d.isCorrect).length);
  $: stacked = width < breakpoint;
  $: inlineStyles = themeStyles[theme];

  onMount(() => {
    isLoaded = true;
  });

  function checkClues() {
    return clues.map((d) => {
      const index = d.index;
      const cellChecks = d.cells.map((c) => {
        const { value } = cells.find((e) => e.id === c.id);
        const hasValue = !!value;
        const hasCorrect = value === c.answer;
        return { hasValue, hasCorrect };
      });
      const isCorrect =
        cellChecks.filter((c) => c.hasCorrect).length === d.answer.length;
      const isFilled =
        cellChecks.filter((c) => c.hasValue).length === d.answer.length;
      return {
        ...d,
        isCorrect,
        isFilled,
      };
    });
  }

  function reset() {
    isRevealing = false;
    isChecking = false;
    focusedCellIndex = 0;
    focusedDirection = "across";
  }

  function onClear() {
    reset();
    if (revealTimeout) clearTimeout(revealTimeout);
    cells = cells.map((cell) => ({
      ...cell,
      value: "",
    }));
  }

  function onReveal() {
    if (revealed) return true;
    reset();
    cells = cells.map((cell) => ({
      ...cell,
      value: cell.answer,
    }));
    startReveal();
  }

  function onCheck() {
    isChecking = true;
  }

  function startReveal() {
    isRevealing = true;
    isChecking = false;
    if (revealTimeout) clearTimeout(revealTimeout);
    revealTimeout = setTimeout(() => {
      isRevealing = false;
    }, revealDuration + 250);
  }

  function onToolbarEvent({ detail }) {
    if (detail === "clear") onClear();
    else if (detail === "reveal") onReveal();
    else if (detail === "check") onCheck();
  }
</script>

{#if validated}
  <article
    class="svelte-crossword"
    bind:offsetWidth="{width}"
    style="{inlineStyles}">
    <slot
      name="toolbar"
      onClear="{onClear}"
      onReveal="{onReveal}"
      onCheck="{onCheck}">
      <Toolbar actions="{actions}" on:event="{onToolbarEvent}" />
    </slot>

    <div class="play" class:stacked class:is-loaded="{isLoaded}">
      <Clues
        clues="{clues}"
        cellIndexMap="{cellIndexMap}"
        stacked="{stacked}"
        isDisableHighlight="{isDisableHighlight}"
        isLoaded="{isLoaded}"
        bind:focusedCellIndex
        bind:focusedCell
        bind:focusedDirection />
      <Puzzle
        clues="{clues}"
        focusedCell="{focusedCell}"
        isRevealing="{isRevealing}"
        isChecking="{isChecking}"
        isDisableHighlight="{isDisableHighlight}"
        revealDuration="{revealDuration}"
        showKeyboard="{showKeyboard}"
        stacked="{stacked}"
        isLoaded="{isLoaded}"
        keyboardStyle="{keyboardStyle}"
        bind:cells
        bind:focusedCellIndex
        bind:focusedDirection />
    </div>

    {#if isComplete && !isRevealing && showCompleteMessage}
      <CompletedMessage showConfetti="{showConfetti}">
        <slot name="message">
          <h3>You solved it!</h3>
        </slot>
      </CompletedMessage>
    {/if}
  </article>
{/if}

<style>
  article {
    position: relative;
    background-color: transparent;
    font-size: 16px;
  }

  .play {
    display: flex;
    flex-direction: var(--order, row);
  }

  .play.is-loaded.stacked {
    flex-direction: column;
  }

  h3 {
    margin: 0;
    margin-bottom: 0.5em;
  }

  @media only screen and (max-width: 720px) {
    .play:not(.is-loaded) {
      flex-direction: column;
    }
  }
</style>
```
  </file>
  <file path="samples/general/crossword-representation/pages/vendor/svelte-crossword/src/Puzzle.svelte">
```svelte
<script>
  import { onMount } from "svelte";
  import Keyboard from "svelte-keyboard";
  import getSecondarilyFocusedCells from "./helpers/getSecondarilyFocusedCells.js";
  import getCellAfterDiff from "./helpers/getCellAfterDiff.js";
  import checkMobile from "./helpers/checkMobile.js";

  import Cell from "./Cell.svelte";

  export let clues;
  export let cells;
  export let focusedDirection;
  export let focusedCellIndex;
  export let focusedCell;
  export let isRevealing;
  export let isChecking;
  export let isDisableHighlight;
  export let stacked;
  export let revealDuration = 0;
  export let showKeyboard;
  export let isLoaded;
  export let keyboardStyle;

  let element;
  let cellsHistoryIndex = 0;
  let cellsHistory = [];
  let focusedCellIndexHistoryIndex = 0;
  let focusedCellIndexHistory = [];
  let secondarilyFocusedCells = [];
  let isMobile = false;
  let isPuzzleFocused = false;

  const numberOfStatesInHistory = 10;
  $: w = Math.max(...cells.map((d) => d.x)) + 1;
  $: h = Math.max(...cells.map((d) => d.y)) + 1;
  $: keyboardVisible =
    typeof showKeyboard === "boolean" ? showKeyboard : isMobile;

  $: cells, focusedCellIndex, focusedDirection, updateSecondarilyFocusedCells();
  $: sortedCellsInDirection = [...cells].sort((a, b) =>
    focusedDirection == "down" ? a.x - b.x || a.y - b.y : a.y - b.y || a.x - b.x
  );

  onMount(() => {
    isMobile = checkMobile();
  });

  function updateSecondarilyFocusedCells() {
    secondarilyFocusedCells = getSecondarilyFocusedCells({
      cells,
      focusedDirection,
      focusedCell,
    });
  }

  function onCellUpdate(index, newValue, diff = 1, doReplaceFilledCells) {
    doReplaceFilledCells = doReplaceFilledCells || !!cells[index].value;

    const dimension = focusedDirection == "across" ? "x" : "y";
    const clueIndex = cells[index].clueNumbers[focusedDirection];
    const cellsInClue = cells.filter(
      (cell) =>
        cell.clueNumbers[focusedDirection] == clueIndex &&
        (doReplaceFilledCells || !cell.value)
    );
    const cellsInCluePositions = cellsInClue
      .map((cell) => cell[dimension])
      .filter(Number.isFinite);
    const isAtEndOfClue =
      cells[index][dimension] == Math.max(...cellsInCluePositions);

    const newCells = [
      ...cells.slice(0, index),
      { ...cells[index], value: newValue },
      ...cells.slice(index + 1),
    ];
    cellsHistory = [newCells, ...cellsHistory.slice(cellsHistoryIndex)].slice(
      0,
      numberOfStatesInHistory
    );
    cellsHistoryIndex = 0;
    cells = newCells;

    if (isAtEndOfClue && diff > 0) {
      onFocusClueDiff(diff);
    } else {
      onFocusCellDiff(diff, doReplaceFilledCells);
    }
  }

  function onHistoricalChange(diff) {
    cellsHistoryIndex += -diff;
    cells = cellsHistory[cellsHistoryIndex] || cells;
    focusedCellIndexHistoryIndex += -diff;
    focusedCellIndex =
      focusedCellIndexHistory[cellsHistoryIndex] || focusedCellIndex;
  }

  function onFocusCell(index) {
    if (isPuzzleFocused && index == focusedCellIndex) {
      onFlipDirection();
    } else {
      focusedCellIndex = index;
      
      if (!cells[focusedCellIndex].clueNumbers[focusedDirection]) {
        const newDirection = focusedDirection === "across" ? "down" : "across";
        focusedDirection = newDirection
      }

      focusedCellIndexHistory = [
        index,
        ...focusedCellIndexHistory.slice(0, numberOfStatesInHistory),
      ];
      focusedCellIndexHistoryIndex = 0;
    }
  }

  function onFocusCellDiff(diff, doReplaceFilledCells = true) {
    const sortedCellsInDirectionFiltered = sortedCellsInDirection.filter((d) =>
      doReplaceFilledCells ? true : !d.value
    );
    const currentCellIndex = sortedCellsInDirectionFiltered.findIndex(
      (d) => d.index == focusedCellIndex
    );
    const nextCellIndex = (
      sortedCellsInDirectionFiltered[currentCellIndex + diff] || {}
    ).index;
    const nextCell = cells[nextCellIndex];
    if (!nextCell) return;
    onFocusCell(nextCellIndex);
  }

  function onFocusClueDiff(diff = 1) {
    const currentNumber = focusedCell.clueNumbers[focusedDirection];
    let nextCluesInDirection = clues.filter(
      (clue) =>
        !clue.isFilled &&
        (diff > 0
          ? clue.number > currentNumber
          : clue.number < currentNumber) &&
        clue.direction == focusedDirection
    );
    if (diff < 0) {
      nextCluesInDirection = nextCluesInDirection.reverse();
    }
    let nextClue = nextCluesInDirection[Math.abs(diff) - 1];
    if (!nextClue) {
      onFlipDirection();
      nextClue = clues.filter((clue) => clue.direction == focusedDirection)[0];
    }
    const nextFocusedCell =
      sortedCellsInDirection.find(
        (cell) =>
          !cell.value && cell.clueNumbers[focusedDirection] == nextClue.number
      ) || {};
    focusedCellIndex = nextFocusedCell.index || 0;
  }

  function onMoveFocus(direction, diff) {
    if (focusedDirection != direction) {
      const dimension = direction == "across" ? "x" : "y";
      focusedDirection = direction;
    } else {
      const nextCell = getCellAfterDiff({
        diff,
        cells,
        direction,
        focusedCell,
      });
      if (!nextCell) return;
      onFocusCell(nextCell.index);
    }
  }

  function onFlipDirection() {
    const newDirection = focusedDirection === "across" ? "down" : "across";
    const hasClueInNewDirection = !!focusedCell["clueNumbers"][newDirection];
    if (hasClueInNewDirection) focusedDirection = newDirection;
  }

  function onKeydown({ detail }) {
    const diff = detail === "Backspace" ? -1 : 1;
    const value = detail === "Backspace" ? "" : detail;
    onCellUpdate(focusedCellIndex, value, diff);
  }

  function onClick() {
    isPuzzleFocused = element.contains(document.activeElement);
  }
</script>

<svelte:window on:click="{onClick}" />

<section
  class="puzzle"
  class:stacked
  class:is-loaded="{isLoaded}"
  bind:this="{element}">
  <svg viewBox="0 0 {w} {h}">
    {#each cells as { x, y, value, answer, index, number, custom }}
      <Cell
        x="{x}"
        y="{y}"
        index="{index}"
        value="{value}"
        answer="{answer}"
        number="{number}"
        custom="{custom}"
        changeDelay="{isRevealing ? (revealDuration / cells.length) * index : 0}"
        isRevealing="{isRevealing}"
        isChecking="{isChecking}"
        isFocused="{focusedCellIndex == index && !isDisableHighlight}"
        isSecondarilyFocused="{secondarilyFocusedCells.includes(index) && !isDisableHighlight}"
        onFocusCell="{onFocusCell}"
        onCellUpdate="{onCellUpdate}"
        onFocusClueDiff="{onFocusClueDiff}"
        onMoveFocus="{onMoveFocus}"
        onFlipDirection="{onFlipDirection}"
        onHistoricalChange="{onHistoricalChange}" />
    {/each}
  </svg>
</section>

{#if keyboardVisible}
  <div class="keyboard">
    <Keyboard
      layout="crossword"
      style="{keyboardStyle}"
      on:keydown="{onKeydown}" />
  </div>
{/if}

<style>
  section {
    position: sticky;
    top: 1em;
    order: 0;
    flex: 1;
    height: fit-content;
  }

  section.is-loaded.stacked {
    position: relative;
    top: auto;
    height: auto;
    order: -1;
  }

  svg {
    width: 100%;
    display: block;
    font-size: 1px;
    background: var(--main-color);
    border: 4px solid var(--main-color);
    box-sizing: border-box;
  }

  .keyboard {
    order: 3;
  }

  @media only screen and (max-width: 720px) {
    section:not(.is-loaded) {
      position: relative;
      top: auto;
      height: auto;
      order: -1;
    }
  }
</style>
```
  </file>
  <file path="samples/general/crossword-representation/pages/vendor/svelte-crossword/src/Toolbar.svelte">
```svelte
<script>
  import { createEventDispatcher } from "svelte";
  const dispatch = createEventDispatcher();

  export let actions = ["clear", "reveal", "check"];
</script>

<div class="toolbar">
  {#each actions as action}
    {#if action === 'clear'}
      <button on:click="{() => dispatch('event', 'clear')}">Clear</button>
    {:else if action === 'reveal'}
      <button on:click="{() => dispatch('event', 'reveal')}">Reveal</button>
    {:else if action === 'check'}
      <button on:click="{() => dispatch('event', 'check')}">Check</button>
    {/if}
  {/each}
</div>

<style>
  .toolbar {
    margin-bottom: 1em;
    padding: 1em 0;
    display: flex;
    justify-content: flex-end;
    font-family: var(--font);
    font-size: 0.85em;
    background-color: transparent;
  }

  button {
    cursor: pointer;
    margin-left: 1em;
    font-size: 1em;
    font-family: var(--font);
    background-color: var(--accent-color);
    border-radius: 4px;
    color: var(--main-color);
    padding: 0.75em;
    border: none;
    font-weight: 400;
    transition: background-color 150ms;
  }

  button:hover {
    background-color: var(--secondary-highlight-color);
  }
</style>
```
  </file>
  <file path="samples/general/crossword-representation/pages/vendor/svelte-crossword/src/helpers/checkMobile.js">
```javascript
export default function checkMobile() {
	const devices = {
		android: () => navigator.userAgent.match(/Android/i),

		blackberry: () => navigator.userAgent.match(/BlackBerry/i),

		ios: () => navigator.userAgent.match(/iPhone|iPad|iPod/i),

		opera: () => navigator.userAgent.match(/Opera Mini/i),

		windows: () => navigator.userAgent.match(/IEMobile/i),
	};

	return devices.android() ||
		devices.blackberry() ||
		devices.ios() ||
		devices.opera() ||
		devices.windows();
}
```
  </file>
  <file path="samples/general/crossword-representation/pages/vendor/svelte-crossword/src/helpers/createCells.js">
```javascript
export default function createCells(data) {
  const cells = [].concat(...data.map(d => d.cells));
  let dict = {};

  // sort so that ones with number values come first and dedupe
  cells.sort((a, b) => a.y - b.y || a.x - b.x || b.number - a.number);
  cells.forEach((d) => {
    if (!dict[d.id]) {
      dict[d.id] = d;
    } else {
      // consolidate clue numbers for across & down
      dict[d.id].clueNumbers = {
        ...d.clueNumbers,
        ...dict[d.id].clueNumbers,
      };
      // consolidate custom classes
      if (dict[d.id].custom !== d.custom)
        dict[d.id].custom = `${dict[d.id].custom} ${d.custom}`;
    }
  });

  const unique = Object.keys(dict).map((d) => dict[d]);
  unique.sort((a, b) => a.y - b.y || a.x - b.x);
  // add index
  const output = unique.map((d, i) => ({ ...d, index: i }));
  return output;
}
```
  </file>
  <file path="samples/general/crossword-representation/pages/vendor/svelte-crossword/src/helpers/createClues.js">
```javascript
export default function createClues(data) {
	// determine if 0 or 1 based
	const minX = Math.min(...data.map(d => d.x));
	const minY = Math.min(...data.map(d => d.y));
	const adjust = Math.min(minX, minY);

	
	const withAdjust = data.map(d => ({
		...d,
		x: d.x - adjust,
		y: d.y - adjust
	}));

  const withId = withAdjust.map((d, i) => ({
		...d,
    id: `${d.x}-${d.y}`,
  }));
	
  // sort asc by start position of clue so we have proper clue ordering
  withId.sort((a, b) => a.y - b.y || a.x - b.x);

  // create a lookup to store clue number (and reuse if same start pos)
  let lookup = {};
  let currentNumber = 1;

  const withNumber = withId.map((d) => {
    let number;
    if (lookup[d.id]) number = lookup[d.id];
    else {
      lookup[d.id] = number = currentNumber;
      currentNumber += 1;
    }
    return {
      ...d,
      number,
    };
  });


	// create cells for each letter
	const withCells = withNumber.map(d => {
		const chars = d.answer.split("");
    const cells = chars.map((answer, i) => {
      const x = d.x + (d.direction === "across" ? i : 0);
      const y = d.y + (d.direction === "down" ? i : 0);
      const number = i === 0 ? d.number : "";
      const clueNumbers = { [d.direction]: d.number };
      const id = `${x}-${y}`;
      const value = "";
      const custom = d.custom || "";
      return {
        id,
        number,
        clueNumbers,
        x,
        y,
        value,
        answer: answer.toUpperCase(),
        custom,
      };
    });
		return {
			...d,
			cells
		}
	});

	withCells.sort((a, b) => {
		if (a.direction < b.direction) return -1;
		else if (a.direction > b.direction) return 1;
		return a.number - b.number;
	});
	const withIndex = withCells.map((d, i) => ({
		...d,
		index: i
	}));
	return withIndex;
}
```
  </file>
  <file path="samples/general/crossword-representation/pages/vendor/svelte-crossword/src/helpers/getCellAfterDiff.js">
```javascript
export default ({ diff, cells, direction, focusedCell }) => {
  const dimension = direction == "across" ? "x" : "y";
  const otherDimension = direction == "across" ? "y" : "x";
  const start = focusedCell[dimension];
  const absDiff = Math.abs(diff);
  const isDiffNegative = diff < 0;

  const cellsWithDiff = cells
    .filter(
      (cell) =>
        // take out cells in other columns/rows
        cell[otherDimension] == focusedCell[otherDimension] &&
        // take out cells in wrong direction
        (isDiffNegative ? cell[dimension] < start : cell[dimension] > start)
    )
    .map((cell) => ({
      ...cell,
      // how far is this cell from our focused cell?
      absDiff: Math.abs(start - cell[dimension]),
    }));

  cellsWithDiff.sort((a, b) => a.absDiff - b.absDiff);
  return cellsWithDiff[absDiff - 1];
};
```
  </file>
  <file path="samples/general/crossword-representation/pages/vendor/svelte-crossword/src/helpers/getSecondarilyFocusedCells.js">
```javascript
export default ({ cells, focusedDirection, focusedCell }) => {
  const dimension = focusedDirection == "across" ? "x" : "y";
  const otherDimension = focusedDirection == "across" ? "y" : "x";
  const start = focusedCell[dimension];

  const cellsWithDiff = cells
    .filter(
      (cell) =>
        // take out cells in other columns/rows
        cell[otherDimension] == focusedCell[otherDimension]
    )
    .map((cell) => ({
      ...cell,
      // how far is this cell from our focused cell?
      diff: start - cell[dimension],
    }));
    
	cellsWithDiff.sort((a, b) => a.diff - b.diff);

  // highlight all cells in same row/column, without any breaks
  const diffs = cellsWithDiff.map((d) => d.diff);
  const indices = range(Math.min(...diffs), Math.max(...diffs)).map((i) =>
    diffs.includes(i) ? i : " "
  );
  const chunks = indices.join(",").split(", ,");
  const currentChunk = (
    chunks.find(
      (d) => d.startsWith("0,") || d.endsWith(",0") || d.includes(",0,")
    ) || ""
  )
    .split(",")
    .map((d) => +d);

  const secondarilyFocusedCellIndices = cellsWithDiff
    .filter((cell) => currentChunk.includes(cell.diff))
    .map((cell) => cell.index);
  return secondarilyFocusedCellIndices;
};

const range = (min, max) =>
  Array.from({ length: max - min + 1 }, (v, k) => k + min);
```
  </file>
  <file path="samples/general/crossword-representation/pages/vendor/svelte-crossword/src/helpers/scrollTo.js">
```javascript
export default function scrollTO (node, isFocused) {
  return {
    update(newIsFocused) {
      isFocused = newIsFocused;
      if (!isFocused) return;
      const list = node.parentElement.parentElement;
      if (!list) return;

      const top = node.offsetTop;
      const currentYTop = list.scrollTop;
      const currentYBottom = currentYTop + list.clientHeight;
      const buffer = 50;
      if (top < currentYTop + buffer || top > currentYBottom - buffer) {
        list.scrollTo({ top: top, behavior: "smooth" });
      }
    },
  };
}
```
  </file>
  <file path="samples/general/crossword-representation/pages/vendor/svelte-crossword/src/helpers/themeStyles.js">
```javascript
import classic from "../themes/classic.js";
import dark from "../themes/dark.js";
import citrus from "../themes/citrus.js";
import amelia from "../themes/amelia.js";

const themes = { classic, dark, citrus, amelia };
const defaultTheme = themes["classic"];

Object.keys(themes).forEach((t) => {
	themes[t] = Object.keys(defaultTheme)
		.map((d) => `--${d}: var(--xd-${d}, ${themes[t][d] || defaultTheme[d]})`)
		.join(";");
});

export default themes;
```
  </file>
  <file path="samples/general/crossword-representation/pages/vendor/svelte-crossword/src/helpers/utils.js">
```javascript
function fromPairs(arr) {
  let res = {};
  arr.forEach((d) => {
    res[d[0]] = d[1];
  });
  return res;
};

export { fromPairs };
```
  </file>
  <file path="samples/general/crossword-representation/pages/vendor/svelte-crossword/src/helpers/validateClues.js">
```javascript
export default function validateClues(data) {
	const props = [
    {
      prop: "clue",
      type: "string",
    },
    {
      prop: "answer",
      type: "string",
    },
    {
      prop: "x",
      type: "number",
    },
    {
      prop: "y",
      type: "number",
    }
  ];

	// only store if they fail
	let failedProp = false;
  data.forEach(d => !!props.map(p => {
		const f = typeof d[p.prop] !== p.type;
		if (f) {
			failedProp = true;
			console.error(`"${p.prop}" is not a ${p.type}\n`, d);
		}
	}));

	let failedCell = false;
	const cells = [].concat(...data.map(d => d.cells));
	
	let dict = {};
	cells.forEach((d) => {
    if (!dict[d.id]) {
      dict[d.id] = d.answer;
    } else {
			if (dict[d.id] !== d.answer) {
				failedCell = true;
				console.error(`cell "${d.id}" has two different values\n`, `${dict[d.id]} and ${d.answer}`);
			}
		}
  });

	return !failedProp && !failedCell;
}
```
  </file>
  <file path="samples/general/crossword-representation/pages/vendor/svelte-crossword/src/themes/amelia.js">
```javascript
export default {
	"font": "sans-serif",
	"primary-highlight-color": "#d7cefd",
	"secondary-highlight-color": "#9980fa",
	"main-color": "#353b48",
	"bg-color": "#fff",
	"accent-color": "#efefef",
	"scrollbar-color": "#9980fa",
};
```
  </file>
  <file path="samples/general/crossword-representation/pages/vendor/svelte-crossword/src/themes/citrus.js">
```javascript
export default {
	"primary-highlight-color": "#ff957d",
	"secondary-highlight-color": "#ffdfd5",
	"main-color": "#184444",
	"accent-color": "#ebf3f3"
};
```
  </file>
  <file path="samples/general/crossword-representation/pages/vendor/svelte-crossword/src/themes/classic.js">
```javascript
export default {
	"font": "sans-serif",
	"primary-highlight-color": "#ffda00",
	"secondary-highlight-color": "#a7d8ff",
	"main-color": "#1a1a1a",
	"bg-color": "#fff",
	"accent-color": "#efefef",
	"scrollbar-color": "#cdcdcd",
	"order": "row"
};
```
  </file>
  <file path="samples/general/crossword-representation/pages/vendor/svelte-crossword/src/themes/dark.js">
```javascript
export default {
	"primary-highlight-color": "#066",
	"secondary-highlight-color": "#003d3d",
	"main-color": "#efefef",
	"bg-color": "#1a1a1a",
	"accent-color": "#3a3a3a"
};
```
  </file>
  <omitted path="build/assets/index-64022410.js">Locally shipped runtime build or library dependency; readable author components and styles are included in this bundle.</omitted>
  <omitted path="build/assets/index-95148e6d.css">Locally shipped runtime build or library dependency; readable author components and styles are included in this bundle.</omitted>
</sample>
