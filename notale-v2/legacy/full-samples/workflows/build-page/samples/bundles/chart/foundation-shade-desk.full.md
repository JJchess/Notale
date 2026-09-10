<sample id="foundation-shade-desk" category="chart" variant="full">
  <file path="samples/chart/foundation-shade-desk/pages/index.html">
```html
<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>不只是色号的数量 · Beauty Brawl</title><link rel="stylesheet" href="assets/nunito.css"><link rel="stylesheet" href="original-brawl.css"><link rel="stylesheet" href="style.css"><body><main><header><a href="../../../../../index.html" target="_top">← Pudding Samples</a><span>BEAUTY BRAWL / MAY 2018 DATA</span></header><section class="intro"><div><p class="eyebrow">LIGHTNESS OF FOUNDATION SHADES</p><h1>不只是色号的数量</h1><p>同样一组色号，换成明度区间来看。<br>从真实色块切换到数量，再加入 Fenty 比较。</p><label for="group">选择原作比较组</label><select id="group"><option value="2">US Bestsellers</option><option value="4">BIPOC 推荐 · 白人创始人品牌</option><option value="3">BIPOC 推荐 · BIPOC 创始人品牌</option><option value="5">Nigerian Bestsellers</option><option value="6">Japanese Bestsellers</option><option value="7">Indian Bestsellers</option></select></div><button id="open-image" aria-label="查看当前原作实物拼贴图"><img id="illustration" src="assets/img/round12.jpg" alt="Jason Li 原作实物拼贴：Fenty 与美国畅销粉底品牌"></button></section><section class="desk"><div class="comp-brawl"><div class="comp-brawl_graphic"><div class="chart"><div class="graphic-hed"><p class="graphic-title">Lightness of Foundation Shades</p><p class="graphic-sub" id="group-title">US Bestsellers</p><div class="controls"><div role="group" aria-label="图表显示方式"><button id="swatches" aria-pressed="true">Shades · 色块</button><button id="counts" aria-pressed="false">Count · 数量</button></div><label><input id="fenty" type="checkbox"> Compare to Fenty</label></div></div><div class="chart-scroll" tabindex="0" aria-label="粉底明度比较图，可横向滚动"><div class="brawl"></div></div></div></div></div><aside><p class="meta" id="summary" role="status">正在载入原数据…</p><h2>每个小色块，都是一个原色号</h2><p>按原数据的 L 值分入十个区间：0 最暗，100 最亮。切换数量时，格子里的数值与黄色深浅来自同一批记录。</p><p>点击或用键盘选择一个区间，查看它的原始色值。</p><section id="detail" aria-label="选中区间详情"><h3>选择一个区间</h3><div id="swatch-detail"></div></section><p class="method">原作采样于 2018 年 5 月。网站色卡明度只是一种粗略比较，未测量上脸后的氧化、底色、肤质与持妆变化。</p></aside></section><footer><p>Story &amp; illustrations: Jason Li · Code: Amber Thomas<br>With assistance from Divya Manian</p><a href="https://pudding.cool/2018/06/makeup-shades/" target="_blank" rel="noreferrer">The Pudding 原作 ↗</a><a href="assets/data/shades.csv" download>完整原 CSV</a><a href="SAMPLE.md">复核记录</a></footer></main><dialog id="viewer"><form method="dialog"><button>关闭 ×</button></form><img id="full-image" alt=""></dialog><script src="vendor/d3.v4.12.0+jetpack.min.js"></script><script src="vendor/brawl.js"></script><script src="app.js"></script></body></html>
```
  </file>
  <file path="samples/chart/foundation-shade-desk/pages/app.js">
```javascript
(async()=>{const $=s=>document.querySelector(s),groups={2:['US Bestsellers','round12.jpg'],4:['BIPOC 推荐 · 白人创始人品牌','round13.jpg'],3:['BIPOC 推荐 · BIPOC 创始人品牌','round13.jpg'],5:['Nigerian Bestsellers','round21.jpg'],6:['Japanese Bestsellers','round22.jpg'],7:['Indian Bestsellers','round23.jpg']};let data=[],chart,mode='swatch';
function describe(node,bin){document.querySelectorAll('.bin-category').forEach(e=>e.setAttribute('aria-pressed',String(e===node)));const brand=node.parentElement.querySelector('.bin-brandTitle').textContent,product=node.parentElement.querySelector('.bin-brandProduct').textContent;$('#detail h3').textContent=`${brand} · ${Number(bin.key)*10}–${Number(bin.key)*10+10}`;const list=$('#swatch-detail');list.replaceChildren();if(!bin.values.length){const p=document.createElement('p');p.textContent='这个明度区间没有原色号。';list.append(p)}for(const d of bin.values){const row=document.createElement('div');row.className='shade-row';const swatch=document.createElement('span');swatch.className='shade';swatch.style.backgroundColor='#'+d.hex;const text=document.createElement('span');text.textContent=`#${d.hex.toUpperCase()} · L ${d.L}`;row.append(swatch,text);list.append(row)}}
function apply(){const columns=document.querySelector('.all-brands');columns.tabIndex=0;columns.setAttribute('aria-label','品牌列，可横向滚动');d3.selectAll('.bin-swatchGroup').classed('is-visible',mode==='swatch');d3.selectAll('.bin-numGroup').classed('is-visible',mode==='num');d3.selectAll('.bin-brand-pf').classed('is-visible',$('#fenty').checked);$('#swatches').setAttribute('aria-pressed',String(mode==='swatch'));$('#counts').setAttribute('aria-pressed',String(mode==='num'));document.querySelectorAll('.bin-category').forEach(node=>{const hidden=node.parentElement.classList.contains('bin-brand-pf')&&!$('#fenty').checked;node.tabIndex=hidden?-1:0;node.setAttribute('role','button');const bin=d3.select(node).datum();node.setAttribute('aria-label',`${node.parentElement.querySelector('.bin-brandTitle').textContent}, L ${+bin.key*10}–${+bin.key*10+10}, ${bin.values.length} shades`);node.onclick=()=>describe(node,bin);node.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();describe(node,bin)}}});const subset=data.filter(d=>d.group===$('#group').value||($('#fenty').checked&&d.group==='0'));$('#summary').textContent=`${new Set(subset.map(d=>d.product_short)).size} 款产品 · ${subset.length} 个原色号`;}
function update(){const id=$('#group').value,subset=data.filter(d=>d.group===id||d.group==='0');if(chart)chart.data(subset);else chart=d3.select('.comp-brawl').datum(subset).brawl();$('#group-title').textContent=groups[id][0];$('#illustration').src='assets/img/'+groups[id][1];$('#illustration').alt='Jason Li 原作实物拼贴 · '+groups[id][0];$('#detail h3').textContent='选择一个区间';$('#swatch-detail').replaceChildren();apply()}
$('#group').onchange=update;$('#swatches').onclick=()=>{mode='swatch';apply()};$('#counts').onclick=()=>{mode='num';apply()};$('#fenty').onchange=()=>{if(!$('#fenty').checked&&document.querySelector('.bin-brand-pf [aria-pressed=true]')){$('#detail h3').textContent='选择一个区间';$('#swatch-detail').replaceChildren()}apply()};$('#open-image').onclick=()=>{$('#full-image').src=$('#illustration').src;$('#full-image').alt=$('#illustration').alt;$('#viewer').showModal()};window.addEventListener('resize',()=>chart?.resize());
try{const response=await fetch('data.json');if(!response.ok)throw Error();data=await response.json();update();window.foundationDesk={data,groups,update};}catch(e){$('#summary').textContent='原数据载入失败，请刷新重试。';console.error(e)}
})();
```
  </file>
  <file path="samples/chart/foundation-shade-desk/pages/style.css">
```css
*{box-sizing:border-box}body{margin:0;color:#282828;background:#fff;font-family:Nunito,Arial,sans-serif}main{max-width:1200px;margin:auto;padding:26px 36px}header{display:flex;justify-content:space-between;gap:20px;font-size:12px;color:#777}a{color:inherit;text-underline-offset:4px}.intro{display:grid;grid-template-columns:1fr 1fr;gap:45px;align-items:center;margin:45px 0 35px}.eyebrow{font-size:11px;letter-spacing:1px;color:#777}h1{font-size:34px;margin:16px 0;font-weight:700;line-height:1.3}.intro p{font-size:16px;line-height:1.8}.intro label{font-size:12px;display:block;margin:20px 0 6px}button,select,input{font:inherit}button,select{background:#fff;border:1px solid #bbb;color:#282828;border-radius:3px;padding:8px 12px;font-size:13px;cursor:pointer}select{max-width:100%}button:focus-visible,select:focus-visible,a:focus-visible,[tabindex]:focus-visible,input:focus-visible{outline:3px solid #00f;outline-offset:3px}#open-image{border:0;padding:0;cursor:zoom-in;width:100%}#illustration{width:100%;display:block}.desk{display:grid;grid-template-columns:minmax(0,1fr) 285px;gap:55px;align-items:start}.comp-brawl{display:block;margin:0;min-width:0}.comp-brawl_graphic{position:static;transform:none}.comp-brawl_graphic .chart{position:static;transform:none;top:auto;font-family:Nunito,sans-serif}.comp-brawl_graphic .graphic-hed .graphic-sub{font-weight:700;font-size:21px}.controls{display:flex;gap:20px;flex-wrap:wrap;align-items:center;margin:16px 0 22px;font-size:12px}.controls [aria-pressed=true]{background:#00f;color:white;border-color:#00f}.controls button{border-color:#00f;color:#00f}.controls label{display:flex;align-items:center;gap:6px}.controls input{accent-color:#00f}.chart-scroll{overflow-x:auto;overflow-y:hidden;padding:6px 0 10px}.comp-brawl_graphic .chart .brawl{width:max-content;min-width:100%;padding-top:8px}.comp-brawl_graphic .chart .brawl .all-brands{overflow:visible;flex:none}.bin-category[role=button]{cursor:pointer}.bin-category[aria-pressed=true]{outline:2px solid #00f;outline-offset:1px}.bin-brand-pf:not(.is-visible){margin-right:0!important}.bin-brand-pf:not(.is-visible) .bin-category{visibility:hidden}aside{padding-top:4px}aside h2{font-size:18px;line-height:1.5;margin:25px 0 12px}aside p{font-size:13px;line-height:1.8}aside .meta{color:#777;font-size:12px}#detail{border-top:1px solid #ddd;margin-top:22px;padding-top:15px}h3{font-size:14px;margin:0 0 12px}#swatch-detail{display:flex;flex-direction:column;gap:6px;max-height:255px;overflow:auto}#swatch-detail p{margin:0}#swatch-detail .shade-row{display:flex;gap:10px;align-items:center;font-size:11px;font-variant-numeric:tabular-nums}.shade{width:24px;height:24px;border:1px solid #0002;flex:none}.method{border-top:1px solid #ddd;padding-top:15px;color:#777;margin-top:24px}footer{display:flex;align-items:start;gap:22px;flex-wrap:wrap;font-size:11px;line-height:1.7;color:#777;padding:28px 0 15px;margin-top:35px;border-top:1px solid #ddd}footer p{margin:0}dialog{border:1px solid #bbb;width:min(950px,94vw);padding:22px;max-height:90vh}dialog::backdrop{background:#000a}dialog form{text-align:right;margin-bottom:15px}dialog img{width:100%;max-height:72vh;object-fit:contain}@media(max-width:850px){.desk{grid-template-columns:minmax(0,1fr);gap:25px}aside{max-width:650px}.intro{gap:25px}}@media(max-width:600px){main{padding:22px}header{flex-direction:column;gap:6px}.intro{grid-template-columns:1fr;margin-top:30px;gap:25px}h1{font-size:29px}.intro p br{display:none}.controls{gap:12px}.controls label{width:100%}.comp-brawl_graphic .chart .brawl .bin-brand{min-width:44px}.chart-scroll{margin-right:-10px}.method{font-size:12px}footer{gap:14px}}

.bin-brand-pf:not(.is-visible){min-width:0!important}
@media(max-width:600px){.comp-brawl_graphic .chart .brawl{width:100%;min-width:0}.comp-brawl_graphic .chart .brawl .all-brands{overflow-x:auto;flex:1;min-width:0}.comp-brawl_graphic .chart .brawl .bin-labelGroup{flex:none}}
```
  </file>
  <file path="samples/chart/foundation-shade-desk/pages/original-brawl.css">
```css
.comp-brawl {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  position: relative;
  margin: 0 auto 6rem auto;
}
@media (min-width: 1000px) and (min-height: 640px) {
  .comp-brawl {
    flex-direction: row;
  }
}
.comp-brawl .scroll-text {
  max-width: 30rem;
  display: none;
  padding: 0 1rem;
  margin-right: 2rem;
}
@media (min-width: 1000px) and (min-height: 640px) {
  .comp-brawl .scroll-text {
    position: relative;
    display: inline-block;
  }
}
.comp-brawl .scroll-text .step {
  margin: 2rem auto;
  display: flex;
  align-items: center;
}
.comp-brawl .mobile-text {
  display: inline-block;
}
@media (min-width: 1000px) and (min-height: 640px) {
  .comp-brawl .mobile-text {
    display: none;
  }
}
@media (min-width: 1000px) and (min-height: 640px) {
  .comp-brawl_graphic {
    position: -webkit-sticky;
    position: sticky;
    top: 0;
    left: 0;
    bottom: auto;
    transform: translate3d(0, 0, 0);
  }
}
.comp-brawl_graphic .graphic-hed {
  font-family: Nunito, sans-serif;
}
.comp-brawl_graphic .graphic-hed .graphic-title {
  text-transform: uppercase;
  font-size: 14px;
  margin-bottom: 0;
  margin-top: 0;
  margin-left: 0.5rem;
}
@media (min-width: 1000px) and (min-height: 640px) {
  .comp-brawl_graphic .graphic-hed .graphic-title {
    margin-left: 0;
  }
}
.comp-brawl_graphic .graphic-hed .graphic-sub {
  font-size: 20px;
  font-weight: 600;
  margin-top: 0;
  margin-bottom: 0.25rem;
  margin-left: 0.5rem;
}
@media (min-width: 1000px) and (min-height: 640px) {
  .comp-brawl_graphic .graphic-hed .graphic-sub {
    margin-left: 0;
  }
}
.comp-brawl_graphic .graphic-hed .graphic-legend {
  display: none;
}
@media (min-width: 1000px) and (min-height: 640px) {
  .comp-brawl_graphic .chart {
    position: absolute;
    top: 51%;
    -moz-transform: translateY(-50%);
    -webkit-transform: translateY(-50%);
    transform: translateY(-50%);
    font-family: Nunito, sans-serif;
  }
}
.comp-brawl_graphic .chart .brawl {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  justify-content: flex-start;
}
.comp-brawl_graphic .chart .brawl .all-brands {
  display: flex;
  flex-direction: row;
  order: 2;
  overflow-x: auto;
  padding-top: 1.1rem;
  padding-right: 5.5rem;
}
@media (min-width: 1000px) and (min-height: 640px) {
  .comp-brawl_graphic .chart .brawl .all-brands {
    overflow-x: visible;
  }
}
.comp-brawl_graphic .chart .brawl .bin-brand {
  order: 2;
  display: flex;
  justify-content: flex-start;
  align-items: center;
  flex-direction: column;
  padding-bottom: 1px;
  margin: 5px 0;
  max-width: 52px;
}
.comp-brawl_graphic .chart .brawl .bin-brand-pf {
  order: 1;
  margin-right: 1.2rem;
  width: 0;
  overflow: hidden;
  transition: width 500ms;
}
.comp-brawl_graphic .chart .brawl .bin-brand-pf .bin-numGroup {
  width: 0 !important;
  overflow: hidden;
}
.comp-brawl_graphic .chart .brawl .bin-brand-pf.is-visible {
  width: 50px;
  transition: width 500ms;
  overflow: visible;
}
.comp-brawl_graphic .chart .brawl .bin-brand-pf.is-visible .bin-numGroup {
  width: 40px !important;
  overflow: visible;
}
.comp-brawl_graphic .chart .brawl .bin-brand-pf .bin-brandTitle {
  color: #00f;
}
.comp-brawl_graphic .chart .brawl .bin-brand-pf .bin-brandProduct {
  color: #99f !important;
}
.comp-brawl_graphic .chart .brawl .bin-brand .bin-category {
  width: 40px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  border: 1px solid #ddd;
  border-radius: 2px;
  padding: 1px;
  height: 33px;
  margin: 2px 2px;
  box-shadow: 0 2px 2px 0 rgba(0,0,0,0.05), 0 2px 8px 0 rgba(0,0,0,0.025);
}
@media (min-width: 1000px) and (min-height: 640px) {
  .comp-brawl_graphic .chart .brawl .bin-brand .bin-category {
    width: 44px;
    height: 36px;
    margin: 3px 2px;
  }
}
.comp-brawl_graphic .chart .brawl .bin-brand .bin-category .bin-swatchGroup {
  opacity: 0;
  transition: opacity 500ms;
  display: none;
}
.comp-brawl_graphic .chart .brawl .bin-brand .bin-category .bin-swatchGroup.is-visible {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: flex-start;
  align-items: flex-start;
  opacity: 1;
  transition: opacity 500ms;
}
.comp-brawl_graphic .chart .brawl .bin-brand .bin-category .bin-swatchGroup .bin-swatch {
  margin: 1px;
  border-radius: 2px;
  display: relative;
  height: 5px;
  width: 5px;
}
@media (min-width: 1000px) and (min-height: 640px) {
  .comp-brawl_graphic .chart .brawl .bin-brand .bin-category .bin-swatchGroup .bin-swatch {
    height: 6px;
    width: 6px;
  }
}
.comp-brawl_graphic .chart .brawl .bin-brand .bin-category .bin-numGroup {
  width: 40px;
  height: 29px;
  opacity: 0;
  transition: opacity 500ms;
  display: none;
  font-family: Nunito, sans-serif;
}
@media (min-width: 1000px) and (min-height: 640px) {
  .comp-brawl_graphic .chart .brawl .bin-brand .bin-category .bin-numGroup {
    width: 40px;
    height: 32px;
    padding: 1px;
  }
}
.comp-brawl_graphic .chart .brawl .bin-brand .bin-category .bin-numGroup.is-visible {
  display: flex;
  justify-content: center;
  align-items: center;
  opacity: 1;
  transition: opacity 500ms;
}
.comp-brawl_graphic .chart .brawl .bin-brand .bin-category .bin-numGroup .bin-num {
  display: relative;
}
.comp-brawl_graphic .chart .brawl .bin-brand .bin-category .bin-numGroup .bin-num-0 {
  color: #c9c9c9;
}
.comp-brawl_graphic .chart .brawl .bin-vsGroup {
  order: 2;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  padding: 2px 0;
  margin: 5px 0;
}
.comp-brawl_graphic .chart .brawl .bin-vsGroup .bin-vsCat {
  border-top: 1px dashed #c9c9c9;
  border-bottom: 1px dashed #c9c9c9;
  margin: 2px 0;
  padding-bottom: 2px;
  display: flex;
  justify-content: center;
  align-content: center;
  flex-direction: column;
}
.comp-brawl_graphic .chart .brawl .bin-vsGroup .bin-vsCat-0 {
  visibility: hidden;
}
.comp-brawl_graphic .chart .brawl .bin-vsGroup .bin-vsCat .bin-vs {
  font-size: 14px;
  line-height: 1.5;
  color: #969696;
}
.comp-brawl_graphic .chart .brawl .bin-labelGroup {
  order: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  padding: 1.2rem 2px 2px 2px;
  margin: 5px 0 0 0.5rem;
  transform: translate(0, 12px);
  font-family: Nunito, sans-serif;
}
@media (min-width: 1000px) and (min-height: 640px) {
  .comp-brawl_graphic .chart .brawl .bin-labelGroup {
    margin: 5px 0;
  }
}
.comp-brawl_graphic .chart .brawl .bin-labelGroup .bin-labelTGroup {
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 50px;
  margin: 2px 0;
}
.comp-brawl_graphic .chart .brawl .bin-labelGroup .bin-labelTGroup text {
  text-align: center;
  font-size: 11px;
  line-height: 1.5;
  text-transform: uppercase;
  color: #969696;
  line-height: 1.33;
}
.comp-brawl_graphic .chart .brawl .bin-labelGroup .bin-labelCat {
  height: 33px;
  margin: 2px 0;
  padding-bottom: 2px;
  display: flex;
  justify-content: center;
  align-content: center;
  flex-direction: column;
}
@media (min-width: 1000px) and (min-height: 640px) {
  .comp-brawl_graphic .chart .brawl .bin-labelGroup .bin-labelCat {
    height: 36px;
    margin: 3px 0;
  }
}
.comp-brawl_graphic .chart .brawl .bin-labelGroup .bin-labelCat .bin-label {
  font-size: 11px;
  line-height: 1.5;
  color: #969696;
}
.comp-brawl_graphic .chart .brawl .bin-brandTGroup {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  height: 50px;
  margin: 10px;
  transform: rotate(-45deg);
  max-width: 40px;
  font-family: Nunito, sans-serif;
}
.comp-brawl_graphic .chart .brawl .bin-brandTGroup text {
  text-align: center;
  white-space: nowrap;
}
.comp-brawl_graphic .chart .brawl .bin-brandTGroup .bin-brandTitle {
  font-size: 14px;
  line-height: 1.5;
  font-weight: 600;
}
.comp-brawl_graphic .chart .brawl .bin-brandTGroup .bin-brandProduct {
  font-size: 11px;
  line-height: 1.5;
  color: #969696;
  line-height: 0.9;
}
.comp-brawl_graphic .chart .brawl .bin-brandTGroup .bin-brandTotal {
  font-size: 11px;
  line-height: 1.5;
  color: #969696;
  text-transform: uppercase;
  display: none;
}
.comp-brawl_graphic .chart .brawl .bin-brandTGroup .bin-brandTotal text {
  line-height: 0.8;
}
```
  </file>
  <file path="samples/chart/foundation-shade-desk/pages/vendor/brawl.js">
```javascript
/*
 USAGE (example: line chart)
 1. c+p this template to a new file (line.js)
 2. change puddingChartName to puddingChartLine
 3. in graphic file: import './pudding-chart/line'
 4a. const charts = d3.selectAll('.thing').data(data).puddingChartLine();
 4b. const chart = d3.select('.thing').datum(datum).puddingChartLine();
*/

d3.selection.prototype.brawl = function init(options) {
	function createChart(el) {
		const $selGroup = d3.select(el);
    const $sel = $selGroup.select('.brawl')
		let data = $sel.datum();

		let opacityScale = d3.scaleLinear()
			.domain([0, 18])
			.range([0, 1])

    let bipoc = false

		// dimension stuff
		let pageWidth = 0
		let width = 0;
		let height = 0;
		const marginTop = 0;
		const marginBottom = 0;
		const marginLeft = 0;
		const marginRight = 0;

    let competitors = null
    let competitorMap = null

		// scales
		const scaleX = null;
		const scaleY = null;

		// dom elements
		let $svg = null;
		let $axis = null;
		let $vis = null;

    const events = {
      switch: ({ comp, checked }) => {

        if (comp === competitors) {
          $sel.selectAll('.bin-brand-pf')
            .classed('is-visible', checked)
        }
      },
      button: ({ comp, action }) => {
        if (comp === competitors) {
          let nonGroup = null
          if (action === 'swatch') nonGroup = 'num'
          if (action === 'num') nonGroup = 'swatch'

          $sel.selectAll(`.bin-${nonGroup}Group`)
            .classed('is-visible', false)

          const active = $sel.selectAll(`.bin-${action}Group`)
            .classed('is-visible', true)

        }
      }
    }

		// helper functions

    function setupCompetitorMap(){
      const competitors = [{
        number: 0,
        group: 'Fenty'
      },{
        number: 1,
        group: 'Make Up For Ever'
      },{
        number: 2,
        group: 'us-best'
      }, {
        number: 3,
        group: 'poc-marketed'
      },{
        number: 4,
        group: 'poc-marketed'
      },{
        number: 5,
        group: 'nigerian-best'
      },{
        number: 6,
        group: 'japanese-best'
      },{
        number: 7,
        group: 'indian-best'
      }]

      competitorMap = d3.map(competitors, d => d.number)
    }

		const Chart = {
			// called once at start
			init() {
        setupCompetitorMap()
				Chart.resize();
				Chart.render();
        const notFenty = data.filter(d => d.group != 0)
        const first = notFenty[0].group
        competitors = competitorMap.get(+first).group

        const test = $sel.classed('brawl-pocMarketed')

        if ($sel.classed('brawl-pocMarketed')) bipoc = true
			},
			// on resize, update new dimensions
			resize() {
				// defaults to grabbing dimensions from container element
				width = Math.floor(($sel.node().offsetWidth - marginLeft - marginRight) * 0.6)

				height = $sel.node().offsetHeight - marginTop - marginBottom;

				pageWidth = window.innerWidth

				return Chart;
			},
			// update scales and render chart
			render() {
        const nested = d3.nest()
          .key(e => e.product_short)
          .rollup(leaves => {
            const total = leaves.length
            const group = d3.nest()
              .key(d => d.lightnessGroup)
              .entries(leaves)

              return {total: total, group: group}
          })
          .entries(data)

        const brandCounts = d3.nest()
          .key(d => d.product_short)
          .rollup(e => e.length)
          .entries(data)

          const countMap = d3.map(brandCounts, d => d.key)

          const brandMap = d3.map(data, d => d.product_short)

          let lightnessGroups = []

          // fill in missing values
          const allNested = nested.map(e => {
            const total = e.value.total
            const f = e.value.group
            lightnessGroups.push(f)
            const updatedVal = d3.range(0, 10).map(i => {
              const key = i.toString()
              const match = f.find(d => d.key === key)

              if (match) return match
              else return {key, values: []}
            })
            const bothVal = {total: total, group: updatedVal}
            return {key: e.key, values: bothVal}
          })
            .sort((a, b) => d3.descending(a.values.total, b.values.total))

            $sel.selectAll('.all-brands').remove()

            // enter category divs
					const allBrands = $sel
						.selectAll('.all-brands')
						.data([0])
						.enter()
						.append('div')
						.attr('class', `all-brands`)

          const brands = allBrands
            .selectAll('.bin-brand')
            .data(allNested)
            .enter()
            .append('div')
            .attr('class', (d, i) => `bin-brand bin-brand-${d.key}`)
            .attr('data-brand', (d, i) => i)

          // adding column headers
          const brandTitleGroup = brands
            .selectAll('.bin-brandTGroup')
            .data(d => [d])
            .enter()
            .append('div')
            .attr('class', 'bin-brandTGroup')

          brandTitleGroup
              .append('text')
              .text(d => brandMap.get(d.key).brand)
              .attr('class', 'bin-brandTitle')

          brandTitleGroup
            .append('text')
            .text(d => {
              const product = brandMap.get(d.key).product
              const count = `${d.values.total}`
              return `${product} • ${count}`
            })
            .attr('class', 'bin-brandProduct')

          brandTitleGroup
            .append('text')
            .text(d => `${d.values.total} shades`)
            .attr('class', 'bin-brandTotal')

          // adding lightness categories spread class goes here
          const categories = brands
            .selectAll('.bin-category')
            .data(d => {
              const val = d.values.group
              return val
            })
            .enter()
            .append('div')
            .attr('class', (d, i) => `bin-category bin-category-${i}`)

          const swatchGroup = categories
            .selectAll('.bin-swatchGroup')
            .data(d => [d])
            .enter()
            .append('div')
            .attr('class', 'bin-swatchGroup')

          // Fix height value of this on toggle
          const swatches = swatchGroup
            .selectAll('.bin-swatch')
            .data(d => d.values)
            .enter()
            .append('div')
            .attr('class', d => `bin-swatch bin-swatch-${d.L}`)
            // .style('height', d => pageWidth > 1000 ? `6px` : `5px`)
            // .style('width', d => pageWidth > 1000 ? `6px` : `5px`)
            .style('background-color', d => `#${d.hex}`)


            const numGroup = categories
              .selectAll('.bin-numGroup')
              .data(d => [d])
              .enter()
              .append('div')
              .attr('class', 'bin-numGroup')
							.style('background-color', (d) => {
								const length = d.values.length
								return `rgba(252, 203, 49, ${opacityScale(length)})`})

            const num = numGroup
              .selectAll('.bin-num')
              .data(d => [d])
              .enter()
              .append('text')
              .attr('class', d => {
                const length = d.values.length
                return `bin-num bin-num-${length}`})
              .text(d => {
                const length = d.values.length
                return length
              })


            // Setting up label divs

            const labelGroup = $sel
              .selectAll('.bin-labelGroup')
              .data([0])
              .enter()
              .append('div')
              .attr('class', 'bin-labelGroup')

            const labelTitleGroup = labelGroup
              .append('div')
              .attr('class', 'bin-labelTGroup')

            const labelTitle = labelTitleGroup
              .selectAll('.bin-labelTitle')
              .data(['Lightness', 'Range'])
              .enter()
              .append('text')
              .text(d => d)
              .attr('class', 'bin-labelTitle')


            const labelCat = labelGroup
              .selectAll('.bin-labelCat')
              .data([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
              .enter()
              .append('div')
              .attr('class', 'bin-labelCat')

            const label = labelCat
              .selectAll('.bin-label')
              .data(d => [d])
              .enter()
              .append('text')
              .attr('class', 'bin-label')
              .text(d => `${d * 10} - ${(d * 10) + 10}`)
              .attr('alignment-baseline', 'middle')
              .attr('text-anchor', 'middle')


				return Chart;
			},
			// get / set data
			data(val) {
				if (!arguments.length) return data;
				data = val;
				$sel.datum(data);
				Chart.render();
				return Chart;
			},
			on({ dispatch, event }) {
				dispatch.on(`${event}.${competitors}`, events[event]);
				return Chart;
			},
			toggle(section, step) {
				const selected = d3.select(`.${section}`)
				const check = selected.select('.toggle input')

				function step0(){
					check.property('checked', false)

					selected.selectAll('.bin-brand-pf')
						.classed('is-visible', false)
				}
				function step1(){
					check.property('checked', true)

					selected.selectAll('.bin-brand-pf')
						.classed('is-visible', true)
				}

					if (step === 0) step0()
					if (step === 1) step1()

				return Chart
			}
		};
		Chart.init();

		return Chart;
	}

	// create charts
	const charts = this.nodes().map(createChart);
	return charts.length > 1 ? charts : charts.pop();
};
```
  </file>
  <omitted path="../../../../../index.html">Navigation back to the formal sample gallery.</omitted>
  <omitted path="SAMPLE.md">Local source attribution and approval record; not part of the rendering algorithm.</omitted>
  <omitted path="assets/data/shades.csv">Original local media or dataset retained byte-for-byte in the runnable sample; see its source manifest.</omitted>
  <omitted path="assets/img/round12.jpg">Original local media or dataset retained byte-for-byte in the runnable sample; see its source manifest.</omitted>
  <omitted path="assets/nunito.css">Locally shipped runtime build or library dependency; readable author components and styles are included in this bundle.</omitted>
  <omitted path="vendor/d3.v4.12.0+jetpack.min.js">Locally shipped runtime build or library dependency; readable author components and styles are included in this bundle.</omitted>
</sample>
