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
