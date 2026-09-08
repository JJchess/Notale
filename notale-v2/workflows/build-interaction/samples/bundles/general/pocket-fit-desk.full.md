<sample id="pocket-fit-desk" category="general" variant="full">
  <file path="samples/general/pocket-fit-desk/pages/index.html">
```html
<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>口袋，装得下吗？</title><link rel="stylesheet" href="style.css"><script src="assets/scripts/d3.v4.12.0+jetpack.min.js" defer></script><script src="fit-template.js" defer></script><script src="app.js" defer></script><main><header><a href="../../../../../index.html" target="_top">← Samples</a><span>THE PUDDING · POCKETS · 2018</span></header><section class="intro"><div><p class="eyebrow">80 条牛仔裤 / 同一标称腰围</p><h1>口袋，<br>装得下吗？</h1></div><div class="explain"><p>手机、钱包、一只手。<br>每天随身的小东西，需要多大的口袋？</p><p>选择一件物品，看它在 20 个品牌的前口袋里能否放下。轮廓来自原作实测，变淡的口袋表示装不下。</p><small>2018 年研究样本，非当前商品目录；判定针对未穿着的空口袋。手部测试以手掌至指关节的尺寸判断。</small></div></section><nav aria-label="选择随身物品" id="objects"></nav><section class="summary" aria-live="polite"><p id="selected">选择一件物品，开始比较</p><p>女款 <strong class="stat-women">—</strong><span> / 40 个口袋</span></p><p>男款 <strong class="stat-men">—</strong><span> / 40 个口袋</span></p></section><div class="filters"><label>品牌 <select id="brand"><option value="All brands">全部品牌</option></select></label><label>版型 <select id="style"><option value="All styles">全部版型</option><option value="skinny">紧身 / skinny</option><option value="straight">直筒 / straight</option></select></label><label>价格 <select id="price"><option value="All prices">全部价格</option><option>&lt; $50</option><option>$50 - $99</option><option>$100 - $149</option><option>$150+</option></select></label><button id="reset">清除筛选</button><span id="matches"></span></div><p class="ui-warning" role="status">没有符合条件的口袋，请调整筛选。</p><div class="fit-table"></div><div class="more"><button id="more">展开全部口袋</button><span>点击口袋查看款式、面料和测量值</span></div><footer><a href="https://pudding.cool/2018/08/pockets/">原作 ↗</a><a href="SAMPLE.md">来源与复核</a><span>已审阅入库</span></footer></main><dialog><button id="close">关闭 ×</button><h2 id="detail-title"></h2><div id="detail-picture"></div><p id="detail-copy"></p><dl id="measurements"></dl></dialog></html>
```
  </file>
  <file path="samples/general/pocket-fit-desk/pages/app.js">
```javascript
const $=id=>document.getElementById(id);const objects=[['iphone','phone','iPhone X'],['galaxy','phone','Samsung Galaxy'],['pixel','phone','Google Pixel'],['frontWallet','wallet','前袋钱包'],['pen','pen','笔'],['womenHand','hand','女性的手'],['menHand','hand','男性的手']];let current=null,expanded=false,charts=[];
for(const [id,type,label]of objects){const button=document.createElement('button');button.innerHTML=`<img src="assets/images/${id}.png" alt="">${label}`;button.dataset.id=id;button.setAttribute('aria-pressed','false');button.onclick=()=>{current=current===id?null:id;applyObject()};$('objects').append(button)}
function applyObject(){document.querySelectorAll('#objects button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===current)));const o=objects.find(o=>o[0]===current);for(const c of charts)c.dim(o?.[1]||'phone',current||'iphone',!current);$('selected').textContent=o?`${o[2]} · 原样本总体可容纳比例`:'选择一件物品，开始比较';if(!current)document.querySelectorAll('.stat-women,.stat-men').forEach(e=>e.textContent='—')}
function filter(){charts.forEach(c=>c.toggle($('brand').value,$('price').value,$('style').value));let total=0;document.querySelectorAll('.chart').forEach(group=>{let count=0;group.querySelectorAll('.fit-brand').forEach(card=>{const visible=card.classList.contains('visible');if(visible){count++;total++}card.hidden=!visible||(!expanded&&count>4)});group.querySelector('.text-menWomen').textContent=`${group.classList.contains('chart-women')?'女款 / WOMEN':'男款 / MEN'} · ${count} 个口袋`});$('matches').textContent=`筛选结果 ${total} / 80`;document.querySelector('.ui-warning').classList.toggle('is-active',total===0);$('more').hidden=![...document.querySelectorAll('.chart')].some(g=>g.querySelectorAll('.fit-brand.visible').length>4);$('more').textContent=expanded?'收起口袋':'展开全部口袋'}
for(const id of ['brand','style','price'])$(id).onchange=filter;$('reset').onclick=()=>{$('brand').selectedIndex=0;$('style').selectedIndex=0;$('price').selectedIndex=0;filter()};$('more').onclick=()=>{expanded=!expanded;filter()};
const dialog=document.querySelector('dialog');$('close').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
function detail(card){const d=card.__data__;$('detail-title').textContent=d.brand+' · '+d.name;const pic=card.querySelector('svg').cloneNode(true);pic.setAttribute('viewBox','0 0 225 225');$('detail-picture').replaceChildren(pic);$('detail-copy').textContent=`${d.menWomen==='women'?'女款':'男款'} · ${d.updatedStyle} · $${d.price.toFixed(2)}（2018）\n${d.fabric}`;const list=$('measurements');list.replaceChildren();for(const[k,v]of [['最大深度',d.maxHeightFront],['最小深度',d.minHeightFront],['最大宽度',d.maxWidthFront],['开口宽度',d.minWidthFront]]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v+' cm';list.append(dt,dd)}dialog.showModal()}
fetch('assets/data/measurementsRectangles.json').then(r=>r.json()).then(data=>{data.sort((a,b)=>d3.ascending(a.brand,b.brand));const grouped=['women','men'].map(key=>({key,values:data.filter(d=>d.menWomen===key)}));charts=d3.select('.fit-table').selectAll('.chart').data(grouped).enter().append('div').fitChart();for(const brand of [...new Set(data.map(d=>d.brand))]){const option=new Option(brand,brand);$('brand').add(option)}document.querySelectorAll('.fit-brand').forEach(card=>{card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',`${card.__data__.brand} ${card.__data__.name} 查看详情`);card.onclick=()=>detail(card);card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();detail(card)}}});filter();document.body.dataset.ready='true'}).catch(e=>{$('selected').textContent='数据加载失败，请刷新重试';console.error(e)});
```
  </file>
  <file path="samples/general/pocket-fit-desk/pages/style.css">
```css
*{box-sizing:border-box}body{margin:0;background:#e7eef8;color:#253952;font-family:Arial,"PingFang SC",sans-serif}main{max-width:1100px;margin:auto;padding:28px 40px}header,footer{display:flex;justify-content:space-between;gap:14px;font-size:11px}header{padding-bottom:24px;border-bottom:1px solid #9cacbf}a{color:inherit;text-underline-offset:4px}.intro{display:grid;grid-template-columns:1fr 1fr;gap:60px;margin:40px 0}h1{font:500 64px/1.15 Georgia,"Songti SC",serif;margin:20px 0}.eyebrow{font-size:11px;letter-spacing:2px}.explain{padding-top:20px;line-height:1.8}.explain p:first-child{font-size:22px;margin-top:0}.explain p{font-size:14px}.explain small{font-size:11px;color:#576f8a}button,select{font:inherit;color:inherit;cursor:pointer}button{border:1px solid #92a6bd;background:transparent;padding:10px 15px}button:hover{background:#d3dfec}button:focus-visible,select:focus-visible,.fit-brand:focus-visible{outline:3px solid #334f73;outline-offset:3px}#objects{display:grid;grid-template-columns:repeat(7,1fr);border-top:1px solid #9cacbf;border-bottom:1px solid #9cacbf;padding:12px 0;gap:8px}#objects button{border-color:transparent;font-size:11px;line-height:1.4;padding:12px 5px}#objects img{height:58px;max-width:60px;object-fit:contain;display:block;margin:0 auto 12px}#objects button[aria-pressed=true]{border-color:#253952;background:#d5e0ef}.summary{display:flex;align-items:center;gap:32px;border-bottom:1px solid #9cacbf;padding:15px 0;font-size:13px}.summary p:first-child{margin-right:auto}.summary strong{font:34px Georgia;margin-left:6px}.summary span{display:block;text-align:right;font-size:10px;color:#576f8a;margin-top:4px}.stat-women{color:#e04b3d}.stat-men{color:#947200}.filters{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:24px 0;font-size:12px}.filters select{padding:7px 2px;background:transparent;border:0;border-bottom:1px solid #92a6bd;max-width:180px}#matches{margin-left:auto}.fit-table{display:grid;grid-template-columns:1fr 1fr;gap:36px}.text-menWomen{display:block;font-size:13px;text-transform:uppercase;font-weight:bold;margin-bottom:12px}.container{display:grid;grid-template-columns:repeat(2,225px);gap:16px}.fit-brand{border:1px solid #879cb5;position:relative;cursor:pointer;overflow:hidden}.fit-brand[hidden]{display:none}.display{display:flex;flex-direction:column-reverse;justify-content:flex-end;transition:opacity .2s}.dimmed{opacity:.28}.text{display:flex;justify-content:space-between;min-height:63px;padding:12px}.leftText text{display:block;font-size:12px}.brand{font-weight:bold;text-transform:uppercase;max-width:164px}.tag{display:block;background:#f64d3c;color:white;font-size:12px;padding:8px}.men .tag{background:#f8c529}.outline{fill:none;stroke:#4e7296;stroke-width:1.2;stroke-dasharray:3 2}.measure{font-size:10px;fill:#334f73}.tooltip{display:none}.ui-warning{display:none;padding:25px;background:#d6e0ed}.ui-warning.is-active{display:block}.more{display:flex;align-items:center;gap:20px;margin:28px 0 50px;font-size:12px}.more span{color:#576f8a}footer{border-top:1px solid #9cacbf;padding-top:20px}dialog{max-width:540px;width:calc(100% - 32px);padding:28px;background:#e7eef8;border:1px solid #253952;color:#253952}dialog::backdrop{background:#182b44aa}#close{float:right}dialog h2{font:26px Georgia;clear:both;padding-top:18px}#detail-picture svg{display:block;margin:auto;width:300px;height:300px}#detail-copy{font-size:13px;line-height:1.8}dl{display:grid;grid-template-columns:1fr 1fr;font-size:13px;gap:12px}dd{margin:0;text-align:right}@media(max-width:1050px){.container{grid-template-columns:225px;justify-content:center}.text-menWomen{text-align:center}}@media(max-width:600px){main{padding:24px}.intro{display:block;margin:24px 0}h1{font-size:48px}.explain{padding:0}.explain p:first-child{font-size:18px}#objects{grid-template-columns:repeat(4,1fr);gap:3px}#objects img{height:46px}.summary{gap:18px;flex-wrap:wrap}.summary p:first-child{width:100%;margin:0}.summary strong{font-size:30px}.summary p{margin:5px 0}.fit-table{grid-template-columns:1fr;gap:30px}.container{grid-template-columns:225px}.more{flex-wrap:wrap}.filters{gap:14px}header span{max-width:125px;text-align:right;font-size:10px}footer{flex-wrap:wrap}}@media(prefers-reduced-motion:reduce){.display{transition:none}}
```
  </file>
  <file path="samples/general/pocket-fit-desk/pages/fit-template.js">
```javascript
/*
 USAGE (example: line chart)
 1. c+p this template to a new file (line.js)
 2. change puddingChartName to puddingChartLine
 3. in graphic file: import './pudding-chart/line'
 4a. const charts = d3.selectAll('.thing').data(data).puddingChartLine();
 4b. const chart = d3.select('.thing').datum(datum).puddingChartLine();
*/
//import d3plus from 'd3plus-shape'

d3.selection.prototype.fitChart = function init(options) {
	function createChart(el) {
		const $sel = d3.select(el);
		let data = $sel.datum();
		// dimension stuff
		let width = 0;
		let height = 0;
		const marginTop = 50;
		const marginBottom = 0;
		const marginLeft = 0;
		const marginRight = 0;

		// scales
		const scale = d3.scaleLinear()
		const padding = 10
		const inch = 0.393 // conversion factor for cm -> inches
		function multRectX(val, newWidth){
			const conv = (newWidth * val) / 225
			return conv
		}
		function multRectY(val, newWidth){
			const conv = (newWidth * val) / 175
			return conv
		}
		// function multRectY(val, newWidth){
		// 	const conv = newWidth * val / 300
		// 	return conv
		// }
		//const scaleY = null;

		// dom elements
		let $svg = null;
		let $axis = null;
		let $vis = null;
    let display = null
    let brands = null

		// helper functions
    const objectSizes = [{
      object: 'phone',
			id: 'iphone',
      width: 7,
      height: 14
    }, {
      object: 'wallet',
			id: 'frontWallet',
      width: 8.4,
      height: 10.4
    }, {
      object: 'pen',
			id: 'pen',
      width: 1.5,
      height: 14.5
    }, {
      object: 'hand',
      width: 7.4,
      height: 17.2
    }, {
			object: 'phone',
			id: 'galaxy',
			width: 6.9,
			height: 14.7,
		}, {
			object: 'phone',
			id: 'pixel',
			width: 7.6,
			height: 15.7
		}, {
			object: 'hand',
			id: 'menHand',
			width: 7.7,
			height: 13.4,
			fingerHeight: 18.9,
			fingerWidth: 9.8
		}, {
			object: 'hand',
			id: 'womenHand',
			width: 7,
			height: 12.0,
			fingerHeight: 17.2,
			fingerWidth: 8.9
		}]

		function pocketShape(sel, newData){
			let d = newData
			const g = sel
			const padding = 10
			const point1 = [padding, padding]
			const point2 = [padding, padding + scale(d.maxHeightFront)]

			const curve1Control = [padding + scale(d.maxWidthFront / 2), scale(d.maxHeightFront + 2) + padding]
			const curve1ControlCutout = [padding + scale(d.maxWidthFront * 0.8), scale(d.maxHeightFront * 0.8) + padding]
			const curve1End = [padding + scale(d.maxWidthFront), scale(d.minHeightFront) + padding]
			const curve1EndCutout = [padding + scale(d.maxWidthFront), scale(d.minHeightFront) + padding]
			const cutoutPoint = [padding + scale(d.maxWidthFront - 3), scale(d.maxHeightFront) + padding]

			const point3Cutout = [padding + scale(d.maxWidthFront), scale(d.rivetHeightFront) + padding]
			const point3 = [padding + scale(d.maxWidthFront), scale(d.rivetHeightFront) + padding]
			const curve2Control = [padding + scale((d.maxWidthFront - d.minWidthFront) * 1.5), scale(d.rivetHeightFront) + padding]
			const curve2End = [padding + scale(d.maxWidthFront - d.minWidthFront), padding]

			let path = null

			if(d.cutout == 'TRUE'){
				path = [
					// move to the right padding amount and down padding amount
					"M", point1,
					// draw a line from initial point straight down the length of the maxHeight
					"L", point2,
					////  "l", [scale(d.maxWidthFront), scale(d.minHeightFront - d.maxHeightFront)],
					"L", cutoutPoint,
					// Add a curve to the other side
					"Q", curve1ControlCutout, // control point for curve
						curve1EndCutout, // end point
					// // Draw a line straight up to the min height - rivet height
					"L", point3Cutout,
					// // Add a curve to the line between rivets
					"Q", curve2Control, curve2End,
					//  	,
					"L", point1
					// "l", [-scale(d.maxWidthFront - d.minWidthFront), 0]
					////"L", [padding, padding]
				]
			}
			else {

			path = [
				// move to the right padding amount and down padding amount
				"M", point1,
				// draw a line from initial point straight down the length of the maxHeight
				"L", point2,
				////  "l", [scale(d.maxWidthFront), scale(d.minHeightFront - d.maxHeightFront)],
				// Add a curve to the other side
				"Q", curve1Control, // control point for curve
					curve1End, // end point
				// Draw a line straight up to the min height - rivet height
				"L", point3,
				// Add a curve to the line between rivets
				"Q", curve2Control, curve2End
				 	,
				"L", point1
				// "l", [-scale(d.maxWidthFront - d.minWidthFront), 0]
				////"L", [padding, padding]
			]
		}
			const joined = path.join(" ")
			return joined

		}

		function drawPocket(d){
			let g = d3.select(this)
			// let joined = pocketShape(g, d)

			const drawnPocket = g
				.append('path.outline')
				//.attr('d', joined)

			//const largestRectHand = d.rectangleHand

				// g
				// 	.append('path.largestRect')
				// 	.attr('d', d => {
				// 		const path = [
				// 			"M", largestRectHand.points[0],
				// 			"L", largestRectHand.points[1],
				// 			"L", largestRectHand.points[2],
				// 			"L", largestRectHand.points[3],
				// 			"L", largestRectHand.points[4]
				// 		]
				// 		const joined = path.join(" ")
				// 		return joined
				// 	})

		}

    function drawObject(d, selObject, group, id){
      const g = group

      let rectArea = null
      if (selObject == 'phone') rectArea = 'rectanglePhone'
      if (selObject == 'pen') rectArea = 'rectanglePen'
      if (selObject == 'wallet') rectArea = 'rectangleWallet'
			if (selObject == 'hand') rectArea = 'rectangleHand'

      // draw object
      const display = g//$svg.selectAll('.g-vis')
      let objectWidth =  scale(objectMap.get(id).width)
      let objectHeight = scale(objectMap.get(id).height)


			let firstPointX = multRectX(d[rectArea].points[0][0], width)
			let firstPointY = multRectY(d[rectArea].points[0][1], height)

      // const drawnObject = display
      //   .append('rect.object')
			// 	.attr('width', scale(objectMap.get(id).width))
			// 	.attr('height', scale(objectMap.get(id).height))
      //   .attr('transform-origin', `top left`)
      //   .attr('transform', `translate(${firstPointX}, ${firstPointY})rotate(${d[rectArea].angle})`)
      //   // .attr('transform', `rotate(${d[rectArea].angle})`)
      //   //.attr('transform-origin', `${d[rectArea].cx} ${d[rectArea.cy]}`)
      //   .style('fill', 'none')
      //   .style('stroke', '#fff')
      //   .style('stroke-width', '1px')

				if (selObject != 'hand'){
					display
						.append('svg:image')
						// .attr('x', -9)
						// .attr('y', -12)
						.attr('width', objectWidth)
						.attr('height', objectHeight)
						.attr("xlink:href", `assets/images/${id}.png`)
						.attr('transform-origin', `top left`)
						.attr('transform', `translate(${firstPointX}, ${firstPointY})rotate(${d[rectArea].angle})`)
						.attr('class', 'pocket-object')
				}

				else {
					display
						.append('svg:image')
						// .attr('x', -9)
						// .attr('y', -12)
						.attr('width', scale(objectMap.get(id).fingerWidth))
						.attr('height', scale(objectMap.get(id).fingerHeight))
						.attr("xlink:href", `assets/images/${id}.png`)
						.attr('transform-origin', `top left`)
						.attr('transform', `translate(${firstPointX + ((scale(objectMap.get(id).fingerWidth) - objectWidth) / 2)}, ${firstPointY})rotate(${d[rectArea].angle})`)
						.attr('class', 'pocket-object')
				}



    }


    const objectMap = d3.map(objectSizes, d => d.id)

		const Chart = {
			// called once at start
			init() {
				$sel.attr('class', d => `chart chart-${d.key}`)

        // Add label
        $sel.append('text.tk-atlas.text-menWomen')
          .text(d => `${d.key}'s`)

        const container = $sel.append('div.container')

        // Add svg for front pockets
				brands = container.selectAll('.fit-brand')
          .data(d => d.values)
          .enter()
          .append('div.area-front')
          .attr('class', d => `fit-brand visible ${d.menWomen}`)

        display = brands.append('div.display')
        let tooltip = brands.append('div.tooltip')

        $svg = display.append('svg.fit-canvas')
        const text = display.append('div.text')
				const leftText = text.append('div.leftText')
					//text.append('text.style.tk-atlas').text(d => d.updatedStyle)

				const rightText = text.append('div.rightText')
        leftText.append('text.style.tk-atlas').text(d => d.updatedStyle)
				leftText.append('text.brand.tk-atlas').text(d => d.brand)
				rightText.append('text.tag.tk-atlas').text(d => (d.menWomen).substring(0, 1))

        let toolText = tooltip.append('div.tooltip-text')
        const dollars = d3.format("$.2f")

        toolText.append('text.tt-name.tk-atlas').text(d => d.name)
        toolText.append('text.tt-price.tk-atlas').text(d => `${dollars(d.price)}`)
        toolText.append('text.tt-fabric.tk-atlas').text(d => d.fabric)

				const $g = $svg.append('g');

				// setup viz group
				$vis = $g.append('g.g-vis');

				Chart.resize();
				Chart.render();
			},
			// on resize, update new dimensions
			resize() {
				// defaults to grabbing dimensions from container element
				const innerWidth = window.innerWidth
				const chartWidth = 225 // Stable source desktop coordinate system on every viewport.

				const blocks = $sel.selectAll('.fit-brand')
					.st('width', chartWidth)
					.st('height', d3.round(chartWidth * 1.33, 0))

				blocks.selectAll('.display, .tooltip')
					.st('width', chartWidth)
					.st('height', d3.round(chartWidth * 1.33, 0))

				width = blocks.node().offsetWidth - marginLeft - marginRight;
				height = (width) - marginTop - marginBottom//$sel.node().offsetHeight - marginTop - marginBottom;

				$svg.at({
					width: width + marginLeft + marginRight,
					height: height + marginTop + marginBottom
				});

				scale
					.domain([0, 29])
					.range([0, height])

					// For preparing code for sharing - converting largest rectangle measurements from pixels to cm

				// 	function exportRectangles(rect){
				// 		const val = [rect].map(d => {
				// 			return {
				// 				...d,
				// 				heightCM: scale.invert(d.height),
				// 				widthCM: scale.invert(d.width)
				// 			}
				// 		})
				// 		return val[0]
				// 	}
				//
				// const shareableData = [data].map(d => {
				// 	const val = d.values
				// 	const updated = val.map(e => {
				// 		return {
				// 			...e,
				// 			rectangleHand: exportRectangles(e.rectangleHand),
				// 			rectanglePen: exportRectangles(e.rectanglePen),
				// 			rectangeWallet: exportRectangles(e.rectangleWallet),
				// 			rectanglePhone: exportRectangles(e.rectanglePhone)
				// 		}
				// 	})
				// 	return updated
				// })
				//
				// if(data.key == 'women') window.shareW = JSON.stringify(shareableData)
				// if(data.key == 'men') window.shareM = JSON.stringify(shareableData)




				// if pockets are drawn on page resize, resize them too
				const outlines = $sel.selectAll('.outline')

				if (outlines.size() > 0){
					Chart.update()
				}

				return Chart;
			},
			// update scales and render chart
			render() {


        // Draw front pocket
        const frontGroup = $svg.select('.g-vis')
				//
        // let areaMeasure = null
        // let rect = []
        // let numbers = null
        frontGroup
          .selectAll('.outline')
          .data(d => [d])
          .enter()
          .append('g')
					.each(drawPocket)

          frontGroup
            .selectAll('.measure measure-maxHeight')
            .data(d => [d])
            .enter()
            .append('text')
            .text(d => `${d3.round(d.maxHeightFront * inch, 1)}"`)
            .attr('alignment-baseline', 'hanging')
            .attr('text-anchor', 'end')
            .attr('class', 'tk-atlas measure measure-maxHeight')

            frontGroup
              .selectAll('.measure measure-minHeight')
              .data(d => [d])
              .enter()
              .append('text')
              .text(d => `${d3.round(d.minHeightFront * inch, 1)}"`)
              .attr('alignment-baseline', 'hanging')
              .attr('text-anchor', 'start')
              .attr('class', 'tk-atlas measure measure-minHeight')

            frontGroup
              .selectAll('.measure measure-maxWidth')
              .data(d => [d])
              .enter()
              .append('text')
              .text(d => `${d3.round(d.maxWidthFront * inch, 1)}"`)
              .attr('alignment-baseline', 'hanging')
              .attr('text-anchor', 'middle')
              .attr('class', 'tk-atlas measure measure-maxWidth')

            frontGroup
              .selectAll('.measure measure-minWidth')
              .data(d => [d])
              .enter()
              .append('text')
              .text(d => `${d3.round(d.minWidthFront * inch, 1)}"`)
              .attr('alignment-baseline', 'hanging')
              .attr('text-anchor', 'middle')
              .attr('class', 'tk-atlas measure measure-minWidth')

					Chart.update()

				return Chart;
			},
			update(){
				$svg.selectAll('.outline')
					.attr('d', function(d){
						let g = d3.select(this)
						let joined = pocketShape(g, d)
						return joined
					})

				const frontGroup = $svg.selectAll('.g-vis')

				frontGroup.selectAll('.measure-maxHeight')
				  .attr('transform', d => `translate(${padding/2}, ${scale(d.maxHeightFront / 2)})`)

				frontGroup.selectAll('.measure-minHeight')
					.attr('transform', d => `translate(${scale(d.maxWidthFront) + (padding * 1.5)}, ${scale(d.rivetHeightFront + ((d.minHeightFront - d.rivetHeightFront ) / 2))})`)

				frontGroup.selectAll('.measure-maxWidth')
					.attr('transform', d => `translate(${scale(d.maxWidthFront / 2) + padding}, ${scale(d.maxHeightFront) + (padding * 2.5)})`)

				frontGroup.selectAll('.measure-minWidth')
					.attr('transform', d => `translate(${scale((d.maxWidthFront - d.minWidthFront) + (d.minWidthFront / 2)) + padding}, ${scale(d.rivetHeightFront / 2)})`)

				const groupWidth = frontGroup.node().getBBox().width

				frontGroup
					.attr('transform', function(d){
						const boxWidth = this.getBBox().width
						const leftBBox = frontGroup.selectAll('.measure-maxHeight').node().getBBox().width
						const difWidth = ((width - boxWidth) / 2) + (leftBBox / 2)

						return `translate(${difWidth}, 0)`
					})

				$svg.selectAll('.pocket-object').remove()

				return Chart
			},
			// get / set data
			data(val) {
				if (!arguments.length) return data;
				data = val;
				$sel.datum(data);
				Chart.render();
				return Chart;
			},
      toggle(brand, price, style){

        brands
          .classed('visible', d => {
            if ((d.brand == brand || brand == 'All brands') && (d.updatedStyle == style || style == 'All styles') && (d.priceGroup == price || price == 'All prices')){
							return true}
            else return false
          })

				const visible = d3.selectAll('.fit-brand.visible')

				if (visible.size() < 1){
					d3.select('.ui-warning').classed('is-active', true)
				}

				if (visible.size() > 1){
					d3.select('.ui-warning').classed('is-active', false)
				}

				if (visible.size() < 8){
					d3.select('.btn')
						.prop('disabled', true)
						.classed('is-disabled', true)

					d3.select('.show-more')
						.classed('is-visible', false)
				}

				if (visible.size() > 8){
					d3.select('.btn')
						.prop('disabled', false)
						.classed('is-disabled', false)

						d3.select('.show-more')
							.classed('is-visible', true)
				}

        return Chart
      },
      dim(selObject, id, state){
				const frontGroup = $svg.select('.g-vis')

				if (state == false){
					brands
	          .select('.display')
	          .classed('dimmed', function(d){
	            let rectArea = null
	            if (selObject == 'phone') rectArea = 'rectanglePhone'
	            if (selObject == 'pen') rectArea = 'rectanglePen'
	            if (selObject == 'wallet') rectArea = 'rectangleWallet'
							if (selObject == 'hand') rectArea = 'rectangleHand'

	            let objectWidth =  scale(objectMap.get(id).width)
	            let objectHeight = scale(objectMap.get(id).height)

	            const largestRect = d[rectArea]
	            const rectWidth = multRectX(largestRect.width, width)
	            const opening = scale(d.minWidthFront)
	            const rectHeight = multRectY(largestRect.height, height)

	            if (objectWidth > scale(d.minWidthFront) || objectWidth > rectWidth || objectHeight > rectHeight){
	              const opening = d.minWidthFront
	              return true
	            }
	            else return false
	          })

	        const allDimmed = $sel.selectAll('.dimmed').size()
	        const allPockets = $sel.selectAll('.display').size()

	        if(data.key == 'women'){
	          d3.select('.stat-women')
	            .text(`${d3.round(100 - ((allDimmed/allPockets) * 100), 0)}%`)
	        }
	        else if(data.key == 'men'){
	          d3.select('.stat-men')
	            .text(`${d3.round(100 - ((allDimmed/allPockets) * 100), 0)}%`)
	        }

	        // draw selected object

	        frontGroup.selectAll('.pocket-object').remove()

	        frontGroup
	          .selectAll('.outline-object')
	          .data(d => [d])
	          .enter()
	          .append('g')
	          .each(function(d){
	            const g = d3.select(this)
	            drawObject(d, selObject, g, id)})
				}

				else if (state == true) {
					brands
						.select('.display')
						.classed('dimmed', false)

					frontGroup.selectAll('.pocket-object').remove()
				}



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
  <omitted path="assets/scripts/d3.v4.12.0+jetpack.min.js">Locally shipped runtime build or library dependency; readable author components and styles are included in this bundle.</omitted>
</sample>
