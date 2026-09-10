<sample id="dress-code-clothing" category="chart" variant="full">
  <file path="samples/chart/dress-code-clothing/pages/index.html">
```html
<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Clothes We Wear · Dress code explorer</title><link rel="stylesheet" href="style.css"><body>
<header><a href="../../../../../index.html" target="_top">← Samples</a><span>Amber Thomas / The Pudding · February 2019</span></header>
<main><div class="intro"><img src="assets/clothes.gif" width="84" height="84" alt="Original clothing GIF from the story"><div><p class="eyebrow">481 public high schools · 2018–2019 handbooks</p><h1>Clothes We Wear</h1></div></div>
<p class="lead">Which clothes do school dress codes prohibit—and who are those clothes marketed to? Explore all 41 items in the original study.</p>
<nav aria-label="Explore the five original explanations"><button data-step="0" aria-pressed="true">1 · All items</button><button data-step="1" aria-pressed="false">2 · Most banned</button><button data-step="2" aria-pressed="false">3 · Less often banned</button><button data-step="3" aria-pressed="false">4 · Four exceptions</button><button data-step="4" aria-pressed="false">5 · Marketed to whom?</button></nav>
<section class="clothes"><div class="scroll"><figure class="container__clothes"><div class="container__clothes-title"><h2>Percentage of High Schools Which Prohibit Clothing Items</h2><p class="chart__subtitle-fullWidth">Marketed to <span class="boys">boys</span><span class="girls">girls</span><span class="both">any</span></p></div></figure></div></section>
<p class="hint">Select a clothing label to see the original count and classification.</p>
<div id="item-detail" role="status" aria-live="polite">Choose any of the 41 labels above.</div>
<article id="explanation" aria-live="polite"></article>
<details id="methods"><summary>Study methods and what “short” means</summary><div id="short-notes"></div><p>This is the original 2018–2019 research snapshot, published in February 2019. The 481 public high schools were selected opportunistically from schools with available handbooks; this is not a representative estimate for every US school. Uniform policies, magnet schools and boarding schools were excluded.</p><p>This chart covers items worn on the body: shirts, pants, shorts, skirts, dresses and undergarments. The authors classified marketing using Nike, American Eagle, Adidas, Forever 21 and Urban Outfitters: an item was primarily marketed to one gender when it appeared in more than twice as many stores for that gender. These are the study’s marketing categories, not rules about who can wear an item.</p><p>Counts, rounded percentages and bins are preserved from the original CSV, including the empty 50–60% bin. <a href="assets/data/clothes.csv" download>Download the original chart data</a>. Read the <a href="https://pudding.cool/2019/02/dress-code-sexualization/#methods" target="_blank" rel="noopener">full original methods</a>.</p></details>
</main><footer><a href="https://pudding.cool/2019/02/dress-code-sexualization/" target="_blank" rel="noopener">Original story</a> · <a href="SAMPLE.md">Review notes</a><p>Original data, clothing GIF, typefaces and D3 chart logic. An approved local sample.</p></footer>
<script src="vendor/d3.v4.12.0+jetpack.min.js"></script><script src="chart.js"></script><script src="app.js"></script></body></html>
```
  </file>
  <file path="samples/chart/dress-code-clothing/pages/app.js">
```javascript
(async()=>{
const copy=await fetch('copy.json').then(r=>r.json());
await clothingChart.init();
const buttons=[...document.querySelectorAll('nav button')],items=[...document.querySelectorAll('.clothes__item')];
function step(index){d3.selectAll('.clothes__item').interrupt();clothingChart.setStep(index);buttons.forEach((b,i)=>b.setAttribute('aria-pressed',i===index));document.querySelector('#explanation').innerHTML='<p>'+copy.clothesSteps[index].text+'</p>';document.body.dataset.step=index;if(matchMedia('(prefers-reduced-motion: reduce)').matches){d3.selectAll('.clothes__item').interrupt();items.forEach(el=>{const d=el.__data__;el.style.backgroundColor=index===4?(d.market==='f'?'#0976DC':d.market==='m'?'#158A36':'#FFFFFF'):'#FFFFFF';el.style.color=index===4&&d.market!=='n'?'#FFFFFF':'#282828';});}}
buttons.forEach((b,i)=>b.addEventListener('click',()=>step(i)));
const market={f:'girls',m:'boys',n:'any gender'};
function select(el){items.forEach(x=>x.setAttribute('aria-pressed',x===el));const d=el.__data__;document.querySelector('#item-detail').textContent=`${d.slug} · ${d.n} of 481 schools (${d.per}%). Marketed to ${market[d.market]}. ${d.reveal_body==='y'?'Classified as revealing or accentuating the body.':'One of the four items not classified as revealing or accentuating the body.'}`;}
items.forEach(el=>{el.tabIndex=0;el.setAttribute('role','button');el.setAttribute('aria-pressed','false');el.setAttribute('aria-label',`${el.__data__.slug}: ${el.__data__.per}% of schools. Show details`);el.addEventListener('click',()=>select(el));el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(el);}});});
document.querySelector('#short-notes').innerHTML=copy.clothingNotesText;
step(0);document.body.dataset.ready='true';
})().catch(e=>{document.querySelector('#item-detail').textContent='The original chart data could not be loaded. Reload to try again.';console.error(e)});
```
  </file>
  <file path="samples/chart/dress-code-clothing/pages/chart.js">
```javascript
let data = []
let nested = []

// scrollama setup


// selections
const $scroll = d3.select('.scroll')
const $container = $scroll.select('.container__clothes')
const $text = $scroll.select('.scroll-text')
const $step = $text.selectAll('.step')
const $legend = $scroll.select('.chart__subtitle-fullWidth')

// colors
const white = '#FFFFFF'
const primary = '#0976DC'
const secondary = '#158A36'
const offBlack = '#282828'

let $histCol = null
let $clothes = null

function cleanData(arr){
	return arr.map((d, i) => {
		return {
			...d,
			group: +d.group,
      n: +d.n,
      per: +d.per,
		}
	})
}

function startScroll(){
	$histCol.classed('is-dimmed', false)
	$clothes.classed('is-dimmed', false)
		.st('backgroundColor', white)
		.st('color', offBlack)

	$legend.classed('is-visible', false)
}

function highlightTop(){
	$histCol.classed('is-dimmed', true)

	$container.select('.clothes__group-60').classed('is-dimmed', false)

	$clothes
		.classed('is-dimmed', false)
		.st('backgroundColor', white)
		.st('color', offBlack)

	$legend.classed('is-visible', false)
}

function highlightBottom(){
	$clothes.st('backgroundColor', white)

	$histCol.classed('is-dimmed', true)

	$container.select('.clothes__group-0').classed('is-dimmed', false)

	$clothes
		.classed('is-dimmed', false)
		.st('color', offBlack)

	$legend.classed('is-visible', false)
}

function highlightNonSexual(){
	$clothes.st('backgroundColor', white)

	$histCol.classed('is-dimmed', false)

	$clothes
		.classed('is-dimmed', true)
		.transition()
		.duration(300)
		.st('color', offBlack)

	$container.selectAll('.items__reveal-n').classed('is-dimmed', false)
	$legend.classed('is-visible', false)
}

function addColor(){

	$histCol.classed('is-dimmed', false)
	$clothes.classed('is-dimmed', false)

	$container.selectAll('.items__reveal-n').classed('is-dimmed', true)

	$clothes
		.transition()
		.duration(300)
		.st('backgroundColor', d => {
			if (d.market == 'f') return primary
			else if (d.market == 'm') return secondary
			else return white
		})
		.st('color', d => {
			if (d.market == 'f' || d.market == 'm') return white
			else return offBlack
		})

		$legend.classed('is-visible', true)
}

function handleStepEnter(response){
	const index = response.index

	if (index === 0) startScroll()
	if (index === 1) highlightTop()
	if (index === 2) highlightBottom()
	if (index === 3) highlightNonSexual()
	if (index === 4) addColor()
}

function setup(){
  nested = d3.nest()
    .key(d => +d.group)
    .sortValues((a, b) => d3.ascending(a.market, b.market))
    //.sortValues((a, b) => d3.ascending(a.reveal_body, b.reveal_body))
    .entries(data)

  // fill in any missing groups
  let maxGroup = +d3.max(nested, d => d.key) + 10

  let allNested = d3.range(0, maxGroup, 10).map(i => {
    const preVal = nested.filter(d => +d.key === i)
    const len = preVal.length
    return len === 0 ? {key: i.toString(), values: []} : preVal[0]
  })

  const $subClothes = $container.append('div.clothes__all')

  const groups = $subClothes
    .selectAll('.clothes__group')
    .data(allNested)
    .enter()
    .append('div')
    .attr('class', d => `clothes__group clothes__group-${d.key}`)

	$histCol = $container.selectAll('.clothes__group')

  const $onlyClothes = groups.append('div.clothes__only')

  $onlyClothes
    .selectAll('.clothes__item')
    .data(d => d.values)
    .enter()
    .append('span')
    .text(d => d.slug)
    .attr('class', d => `clothes__item items__reveal-${d.reveal_body} items__market-${d.market}`)
		.st('backgroundColor', white)

		$clothes = $container.selectAll('.clothes__item')

  const axisGroup = groups.append('div.axis__group')

  axisGroup
    .append('div.axis__text')
    .text(d => +d.key === 0 ? `5 - 10%` : `${d.key} - ${+d.key + 10}%`)

  axisGroup
    .append('span.axis__text-sub')
    .text('of schools')


}

function init(){
  return new Promise((resolve) => {
		d3.loadData('assets/data/clothes.csv', (err, response) => {
			data = cleanData(response[0])
      setup()

			resolve()
		})
	})
}

window.clothingChart = {init, setStep: index => handleStepEnter({index})};
```
  </file>
  <file path="samples/chart/dress-code-clothing/pages/style.css">
```css
@font-face{font-family:National;src:url(assets/National2NarrowWeb-Regular.woff2)}@font-face{font-family:National;src:url(assets/National2NarrowWeb-Bold.woff2);font-weight:700}@font-face{font-family:National;src:url(assets/National2NarrowWeb-Black.woff2);font-weight:900}@font-face{font-family:Tiempos;src:url(assets/TiemposTextWeb-Regular.woff2)}
*{box-sizing:border-box}body{margin:0;background:#f2f0ed;color:#282828;font-family:National,sans-serif;font-size:18px}a{color:inherit;text-underline-offset:3px}header,footer{max-width:1100px;margin:auto;padding:22px 20px}header{display:flex;justify-content:space-between;border-bottom:1px solid #ccc;font-size:15px;gap:20px}main{max-width:1100px;margin:auto;padding:38px 20px 0}.intro{display:flex;align-items:center;gap:20px}.intro img{object-fit:contain}.eyebrow{margin:0;color:#676767;font-size:15px;text-transform:uppercase;letter-spacing:1px}h1{font-size:58px;line-height:1.05;margin:8px 0;font-weight:900}.lead{font-family:Tiempos,serif;max-width:780px;font-size:17px;line-height:1.75;margin:22px 0 30px}nav{display:flex;flex-wrap:wrap;gap:8px}button{font:inherit;color:inherit}nav button{border:1px solid #aaa;border-radius:5px;background:transparent;padding:9px 13px;cursor:pointer}nav button[aria-pressed=true]{background:#282828;border-color:#282828;color:white}:focus-visible{outline:3px solid #0976dc;outline-offset:4px}figure{margin:30px 0 0}.container__clothes-title{text-align:center}h2{font-size:24px;margin:0}.chart__subtitle-fullWidth{font-size:14px;text-transform:uppercase;margin:10px 0 30px;opacity:0;transition:opacity 300ms}.chart__subtitle-fullWidth.is-visible{opacity:1}.chart__subtitle-fullWidth span,.girls,.boys{margin:0 4px;padding:2px 9px;border-radius:15px;font-family:National,sans-serif}.boys{background:#158a36;color:white}.girls{background:#0976dc;color:white}.both{background:white}.clothes__all{margin:auto;display:flex;align-items:flex-end;justify-content:center}.clothes__group{width:130px;margin:0 2.4px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;opacity:1;transition:opacity 300ms}.clothes__group.is-dimmed,.clothes__item.is-dimmed{opacity:.3}.clothes__only{display:flex;flex-direction:row;flex-wrap:wrap;justify-content:flex-start}.clothes__item{display:block;font-family:National,sans-serif;font-size:14px;line-height:1.5;margin:1px 8px;padding:1.6px 8px;border-radius:15px;opacity:1;transition:opacity 300ms;cursor:pointer;white-space:nowrap}.clothes__item[aria-pressed=true]{box-shadow:0 0 0 2px #282828}.axis__group{min-width:100px;margin:8px 0;border-top:1px solid #d0d0d0;display:flex;flex-direction:column;align-items:center;color:#666}.axis__text{font-size:14px;font-weight:700;margin-top:4px}.axis__text-sub{font-size:12px;line-height:1}.hint{font-size:15px;color:#666;margin:25px 0 12px;text-align:center}#item-detail{padding:16px 20px;background:white;border-left:4px solid #0976dc;min-height:56px;font-size:18px}#explanation{max-width:750px;font:17px/1.8 Tiempos,serif;margin:28px auto;padding:22px;border:1px solid #999;border-radius:10px;background:#fff}#explanation p{margin:0}details{border-top:1px solid #aaa;margin-top:32px;padding:20px 0}summary{font-weight:700;cursor:pointer;font-size:20px}details p,details #short-notes{font:15px/1.8 Tiempos,serif;max-width:800px;margin:20px 0}footer{border-top:1px solid #ccc;font-size:15px;color:#666}footer p{margin:12px 0 0}
@media(max-width:1000px){.clothes__group{width:12.8%;margin:0 2px}.clothes__item{margin:1px 2px;padding:2px 5px;font-size:13px}.axis__group{min-width:90px}}
@media(max-width:700px){header{font-size:13px;padding:16px;align-items:center}header span{max-width:180px;text-align:right}main{padding:25px 16px 0}.intro{gap:12px}.intro img{width:60px;height:60px}.eyebrow{font-size:12px;letter-spacing:.5px}h1{font-size:40px}.lead{font-size:15px;margin:20px 0}nav{gap:6px}nav button{padding:8px 10px;font-size:15px}figure{margin-top:28px}h2{font-size:21px;text-align:left}.chart__subtitle-fullWidth{text-align:left;margin-bottom:18px}.clothes__all{flex-direction:column-reverse;align-items:flex-start;gap:12px}.clothes__group{width:100%;margin:0;flex-direction:column-reverse;align-items:flex-start}.clothes__only{gap:2px 0}.clothes__item{font-size:15px;padding:3px 8px;margin:1px 4px 1px 0}.axis__group{flex-direction:row;gap:5px;border-top:0;border-bottom:1px solid #ccc;min-width:100%;margin:0 0 6px;padding-bottom:4px}.axis__text{margin:0}.axis__text-sub{font-size:13px}#explanation{font-size:15px;line-height:1.9;padding:17px;margin:24px 0}#item-detail{font-size:17px;padding:14px}.hint{text-align:left}.clothes__group-50 .clothes__only:empty:after{content:'No items in this interval';color:#777;font-size:14px}}
@media(prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
```
  </file>
  <omitted path="../../../../../index.html">Navigation back to the formal sample gallery.</omitted>
  <omitted path="SAMPLE.md">Local source attribution and approval record; not part of the rendering algorithm.</omitted>
  <omitted path="assets/clothes.gif">Original local media or dataset retained byte-for-byte in the runnable sample; see its source manifest.</omitted>
  <omitted path="assets/data/clothes.csv">Original local media or dataset retained byte-for-byte in the runnable sample; see its source manifest.</omitted>
  <omitted path="vendor/d3.v4.12.0+jetpack.min.js">Locally shipped runtime build or library dependency; readable author components and styles are included in this bundle.</omitted>
</sample>
