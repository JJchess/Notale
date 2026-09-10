<sample id="yearbook-hair-timeline" category="chart" variant="full">
  <file path="samples/chart/yearbook-hair-timeline/pages/index.html">
```html
<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Yearbook Hair Timeline · Sample</title><link rel="stylesheet" href="style.css"><body><main><header><a href="../../../../../index.html" target="_top">← Samples</a><span>THE PUDDING / 2019 ARCHIVE</span></header><section class="intro"><p class="eyebrow">1930 — 2013</p><h1>The shape of a decade.</h1><p>Hair trends, told through original yearbook portraits.<br>Explore the median hair-size curves, then look at the decade’s representative styles.</p><p class="credit">Analysis & story: Elle O’Brien · Design & development: Jan Diehm<br><a href="https://pudding.cool/2019/11/big-hair/" target="_blank" rel="noopener">The Pudding original ↗</a> · <a href="SAMPLE.md">Review notes</a></p></section><section class="chart"><div class="controls"><label for="year">Explore a year <output id="year-label">1930</output></label><input id="year" type="range" min="1930" max="2013" step="1" value="1930"><div id="decades" aria-label="Choose a decade"></div></div><figure aria-label="Original median hair-size trend, 1930 to 2013"></figure><div id="values" aria-live="polite"></div><div class="photoWrapper"><section class="f-photos"><h2><span>Women’s</span> representative styles in the <span class="decade">1930s</span></h2><div class="images"></div></section><section class="m-photos"><h2><span>Men’s</span> representative styles in the <span class="decade">1930s</span></h2><div class="images"></div></section></div></section><footer><p>Each decade shows 10 original portraits per group, curated by the authors from images closest to the decade’s average in their hair-feature space. They illustrate a decade; they are not the people used to calculate an individual year’s median.</p><details><summary>How to read this archive</summary><p>The curves are the original Loess-smoothed median hair density, based on estimated hair pixels as a fraction of each image. The original analysis used 37,026 portraits from 1930 onward. The “male” and “female” tags come from the source dataset and approximate perceived gender expression; they do not establish the people’s gender identities. Image lighting and segmentation limitations also affect the measure.</p><p><a href="https://pudding.cool/2019/11/big-hair/" target="_blank" rel="noopener">Read the complete original methodology ↗</a></p></details></footer></main><dialog aria-label="Original yearbook portrait"><button id="close">Close ×</button><img id="large" alt=""><p id="caption"></p><div class="photo-nav"><button id="prev">← Previous</button><button id="next">Next →</button></div></dialog><script src="vendor/d3.v5.11.0.min.js"></script><script src="vendor/line.js"></script><script src="app.js"></script></body></html>
```
  </file>
  <file path="samples/chart/yearbook-hair-timeline/pages/app.js">
```javascript
(async()=>{const $=s=>document.querySelector(s),female=await d3.csv('assets/data/trend_f_smoothed.csv'),male=await d3.csv('assets/data/trend_m_smoothed.csv');const data=female.concat(male),allPhotos=[];let year=1930,decade,currentPhoto,lastPhotoButton,chart;for(let d=1930;d<=2010;d+=10){const b=document.createElement('button');b.textContent=d+'s';b.dataset.decade=d;b.onclick=()=>selectYear(d);$('#decades').append(b);for(const group of ['female','male'])for(let i=1;i<=10;i++)allPhotos.push({decade:d,group,index:i,src:`assets/images/avgs_decade/${d}_${group}_${i}.png`})}for(const group of ['female','male']){const container=$(group==='female'?'.f-photos .images':'.m-photos .images');for(let i=1;i<=10;i++){const b=document.createElement('button'),im=document.createElement('img');im.decoding='async';b.append(im);b.onclick=()=>openPhoto(allPhotos.findIndex(p=>p.decade===decade&&p.group===group&&p.index===i),b);container.append(b)}}chart=d3.select('.chart figure').datum([data,[]]).puddingTrendLines();
function selectYear(value){year=Math.max(1930,Math.min(2013,Math.round(+value)));const nextDecade=Math.floor(year/10)*10;$('#year').value=year;$('#year-label').textContent=year;const f=female.find(d=>+d.year===year),m=male.find(d=>+d.year===year);$('#values').innerHTML=`<span>${year}</span><span class="female-value">Women: ${(+f.smoothed).toFixed(3)}</span><span class="male-value">Men: ${(+m.smoothed).toFixed(3)}</span>`;$('.vertical').style.left=(year-1930)/83*$('figure').clientWidth+'px';if(nextDecade!==decade){decade=nextDecade;document.querySelectorAll('.decade').forEach(e=>e.textContent=decade+'s');document.querySelectorAll('#decades button').forEach(b=>b.setAttribute('aria-pressed',+b.dataset.decade===decade));for(const group of ['female','male'])document.querySelectorAll((group==='female'?'.f-photos':'.m-photos')+' img').forEach((im,i)=>{im.src=`assets/images/avgs_decade/${decade}_${group}_${i+1}.png`;im.alt=`${decade}s ${group}-tagged yearbook portrait ${i+1}`;im.parentElement.setAttribute('aria-label',`Open ${im.alt}`)})}}
function bindChart(){d3.select('.pudding-chart').on('mousemove',null).on('mouseover',null).on('mouseout',null);const svg=$('.pudding-chart');svg.onpointermove=e=>{if(e.pointerType==='touch'&&!e.buttons)return;const r=svg.getBoundingClientRect();selectYear(1930+(e.clientX-r.left)/r.width*83)};svg.onpointerdown=e=>{const r=svg.getBoundingClientRect();selectYear(1930+(e.clientX-r.left)/r.width*83)}}
function openPhoto(i,button){currentPhoto=(i+allPhotos.length)%allPhotos.length;const p=allPhotos[currentPhoto];$('#large').src=p.src;$('#large').alt=`Original ${p.decade}s ${p.group}-tagged portrait ${p.index}`;$('#caption').textContent=`${p.decade}s · ${p.group}-tagged · portrait ${p.index} of 10 · original PNG`;if(!$('dialog').open){lastPhotoButton=button;$('dialog').showModal()}}
$('#close').onclick=()=>$('dialog').close();$('dialog').onclose=()=>lastPhotoButton?.focus({preventScroll:true});$('#prev').onclick=()=>openPhoto(currentPhoto-1);$('#next').onclick=()=>openPhoto(currentPhoto+1);$('dialog').addEventListener('keydown',e=>{if(e.key==='ArrowRight'){e.preventDefault();openPhoto(currentPhoto+1)}if(e.key==='ArrowLeft'){e.preventDefault();openPhoto(currentPhoto-1)}});$('#year').oninput=e=>selectYear(e.target.value);addEventListener('resize',()=>{chart.resize();bindChart();selectYear(year)});bindChart();selectYear(1930);window.hairTimeline={data,female,male,allPhotos,selectYear,openPhoto,chart,get year(){return year}};})();
```
  </file>
  <file path="samples/chart/yearbook-hair-timeline/pages/style.css">
```css
@font-face{font-family:Cooper;src:url('assets/fonts/CooperBlack.woff2');font-weight:400}@font-face{font-family:National;src:url('assets/fonts/National2Web-Regular.woff2');font-weight:400}@font-face{font-family:National;src:url('assets/fonts/National2Web-Bold.woff2');font-weight:700}*{box-sizing:border-box}body{margin:0;color:#282828;background:#fffcf6;font-family:National,Arial,sans-serif}main{max-width:1240px;margin:auto;padding:28px 36px}header{display:flex;justify-content:space-between;gap:16px;font:12px 'Courier New',monospace;padding-bottom:20px;border-bottom:1px solid #eecd9f}a{color:inherit;text-underline-offset:4px}.intro{text-align:center;margin:36px auto 28px}.eyebrow{font:bold 12px 'Courier New',monospace;letter-spacing:2px}h1,h2{font-family:Cooper,Georgia,serif;font-weight:400}h1{font-size:48px;line-height:1.1;margin:14px 0}.intro p{font-size:20px;line-height:1.5}.intro .credit{font-size:12px;font-family:'Courier New',monospace;line-height:1.7}.controls{margin:20px 0 28px}.controls label{display:flex;justify-content:space-between;font:700 15px 'Courier New',monospace}input[type=range]{width:100%;accent-color:#489854;margin:16px 0}#decades{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}button{font:inherit;cursor:pointer;border:1px solid #d7bd97;background:transparent;color:inherit;padding:8px 12px}#decades button{font:bold 13px 'Courier New',monospace}#decades button[aria-pressed=true]{background:#489854;color:#fff;border-color:#489854}button:focus-visible,a:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid #489854;outline-offset:3px}.chart figure{position:relative;width:100%;height:400px;margin:0}.Female{stroke:#489854;stroke-width:4;fill:none}.Male{stroke:#0bbff1;stroke-width:4;fill:none}.area{fill:rgba(238,205,159,.2)}.f-label,.m-label{font-family:Cooper;font-size:30px}.f-label{fill:#489854;text-anchor:end}.m-label{fill:#0bbff1}.axis .domain,.x.axis .tick line,.y.axis .tick text{display:none}.x.axis .tick text{font:700 15px 'Courier New',monospace}.y.axis .tick line{stroke:#eecd9f;stroke-dasharray:2}.axis-label{font:700 14px 'Courier New',monospace;text-transform:uppercase}.tooltip{display:none}.vertical{position:absolute;border-left:2px dashed #282828;pointer-events:none;top:10px;bottom:30px;width:2px}#values{margin:14px 0 26px;display:flex;justify-content:center;gap:28px;font:700 15px 'Courier New',monospace}.female-value{color:#367340}.male-value{color:#087f9f}.photoWrapper{margin:24px 0}.photoWrapper h2{font-size:23px;margin:0 0 12px}.f-photos h2>span:first-child{color:#489854}.m-photos h2>span:first-child{color:#0bbff1}.m-photos{margin-top:30px}.images{display:grid;grid-template-columns:repeat(10,1fr);gap:0}.images button{padding:0;border:0;line-height:0;background:transparent}.images img{display:block;width:100%;height:auto}.images button:hover{outline:3px solid #489854;z-index:1}footer{max-width:900px;margin:36px auto 0;padding:24px 0;border-top:1px solid #eecd9f;font-size:14px;line-height:1.6}summary{cursor:pointer;font-weight:700}dialog{background:#fffcf6;border:0;max-width:90vw;padding:22px;width:460px;color:#282828}dialog::backdrop{background:#191613bd}dialog #close{float:right;margin-bottom:14px}dialog img{display:block;clear:both;width:100%;height:auto;image-rendering:auto}dialog p{font:13px 'Courier New',monospace;line-height:1.5}.photo-nav{display:flex;justify-content:space-between}@media(max-width:700px){main{padding:20px 16px}header{font-size:10px}.intro{margin:28px 0}.intro h1{font-size:36px}.intro p{font-size:18px}.chart figure{height:330px}.f-label,.m-label{font-size:23px}.axis-label{font-size:11px}.x.axis .tick text{font-size:12px}.images{grid-template-columns:repeat(5,1fr)}.photoWrapper h2{font-size:20px;line-height:1.3}#values{font-size:12px;gap:12px;flex-wrap:wrap}#decades{justify-content:start}#decades button{padding:7px 9px}.intro .credit{font-size:11px}}
```
  </file>
  <file path="samples/chart/yearbook-hair-timeline/pages/vendor/line.js">
```javascript
/*
 USAGE (example: line chart)
 1. c+p this template to a new file (line.js)
 2. change puddingChartName to puddingChartLine
 3. in graphic file: import './pudding-chart/line'
 4a. const charts = d3.selectAll('.thing').data(data).puddingChartLine();
 4b. const chart = d3.select('.thing').datum(datum).puddingChartLine();
*/

d3.selection.prototype.puddingTrendLines = function init(options) {
	function createChart(el) {
		const $sel = d3.select(el);
		let data = $sel.datum();
		let photoData = data[1]
		data = data[0]
		// dimension stuff
		let width = 0;
		let height = 0;
		const marginTop = 10;
		const marginBottom = 20;
		const marginLeft = 0;
		const marginRight = 0;

		// data
		let dataByGender = null;
		let femaleData = null;
		let maleData = null;

		// scales
		let maxX = null;
		let minX = null;
		let maxY = null;
		let minY = null;
		let xScale = d3.scaleLinear()
		let xAxis = null;
		let xAxisGroup = null;
		let yScale = d3.scaleLinear()
		let yAxis = null;
		let yAxisGroup = null;
		let axisPadding = 15;

		let genderLines = null;
		let lineGroup = null;
		let femaleLine = null;
		let maleLine = null;
		let genderArea = null;
		let drawArea = null;
		let numTicks = null;

		// dom elements
		let $svg = null;
		let $axis = null;
		let $vis = null;
		let $biggerLabel = null;
		let $smallerLabel = null;
		let $biggerLabelGroup = null;
		let $smallerLabelGroup = null;
		let $upArrow = null;
		let $downArrow = null;
		let $fLabel = null;
		let $mLabel = null;
		let $tooltip = null;
		let $vertical = null;

		const $fPhotoContainer = d3.select('.f-photos')
		const $mPhotoContainer = d3.select('.m-photos')
		const $decadeText = d3.selectAll('.chart .decade')
		let $fPhoto = null;
		let $mPhoto = null;

		// interactions
		let $mouse = null;
		let $mouseX = null;
		let $mouseY = null;

		// helper functions
		function structureData() {
			data = data.map(d => ({
				...d,
				med: +d.med,
				smoothed: +d.smoothed,
				flat: +d.flat,
				discrim: +d.discrim,
				discrimSmoothA: +d.discrimSmoothA,
				discrimSmoothB: +d.discrimSmoothB,
				year: +d.year
			}))
			maxY = d3.max(data, d => d.smoothed)
			minY = d3.min(data, d => d.smoothed)
			maxX = d3.max(data, d => d.year)
			minX = d3.min(data, d => d.year)

			dataByGender = d3.nest()
				.key(d => d.gender)
				.entries(data)

			dataByYear = d3.nest()
				.key(d => d.year)
				.rollup(values => ({
					male: values.find(v => v.gender == "Male").smoothed,
					female: values.find(v => v.gender == "Female").smoothed
				}))
				.entries(data)

			femaleData = data.filter(d => d.gender == 'Female')
			maleData = data.filter(d => d.gender == 'Male')
		}

		function getTicks(w) {
			if (w > 640) { numTicks = 10 }
			else { numTicks = 5 }
		}

		function syncDecade(year) {
			if (year >= 1930 && year < 1940) { return 1930 }
			if (year >= 1940 && year < 1950) { return 1940 }
			if (year >= 1950 && year < 1960) { return 1950 }
			if (year >= 1960 && year < 1970) { return 1960 }
			if (year >= 1970 && year < 1980) { return 1970 }
			if (year >= 1980 && year < 1990) { return 1980 }
			if (year >= 1990 && year < 2000) { return 1990 }
			if (year >= 2000 && year < 2010) { return 2000 }
			if (year >= 2010 && year < 2020) { return 2010 }
		}

		function appendPhotos(match) {
			let decadeMatch = syncDecade(match.year)

			$fPhoto = $fPhotoContainer.selectAll('img')

			$fPhoto
				.attr('src', function(d, i) { return `assets/images/avgs_decade/${decadeMatch}_female_${i+1}.png`})
				.attr('alt', `${decadeMatch}s women's yearbook photo`)

			$mPhoto = $mPhotoContainer.selectAll('img')

			$mPhoto
				.attr('src', function(d, i) { return `assets/images/avgs_decade/${decadeMatch}_male_${i+1}.png`})
				.attr('alt', `${decadeMatch}s men's yearbook photo`)

			$decadeText.text(`${decadeMatch}s`)
		}

		function lineMouseMove(d) {
			$mouse = d3.mouse(this)
			$mouseX = $mouse[0]
			$mouseY = $mouse[1]

			const invertedX = Math.round(xScale.invert($mouseX))
			const invertedY = yScale.invert($mouseY)
			const year = invertedX.toString()
			const match = d[0].find(v => v.year === year)

			const fData = d[0].filter(d => d.gender == 'Female')
			const fMatch = fData.find(v => v.year === year)
			const fNum = (+fMatch.smoothed).toFixed(3)

			const mData = d[0].filter(d => d.gender == 'Male')
			const mMatch = mData.find(v => v.year === year)
			const mNum = (+mMatch.smoothed).toFixed(3)

			const right = $mouseX > window.innerWidth / 2
			const offset = right ? $tooltip.node().offsetWidth + 10 : -10

			appendPhotos(match)

			$tooltip
				.classed('is-visible', true)
				.style('top', `${$mouseY}px`)
				.style('left', `${$mouseX - offset}px`)
				.html(function(d) {
					return `<div class='year'>
						<p>${invertedX}</p>
					</div>
					<div class='f-tip'>
						<div class='line'></div>
						<p>Women: ${fNum}</p>
					</div>
					<div class='m-tip'>
						<div class='line'></div>
						<p>Men: ${mNum}</p>
					</div>`
				})

			$vertical
				.classed('is-visible', true)
				.style('left', `${$mouseX}px`)
				.style('bottom', '29px')
		}

		function lineMouseOut(d) {
			$tooltip.classed('is-visible', false)
			$vertical.classed('is-visible', false)
		}

		const Chart = {
			// called once at start
			init() {
				structureData()

				$tooltip = d3.selectAll('.chart figure').append('div').attr('class', 'tooltip')
				$vertical = d3.selectAll('.chart figure').append('div').attr('class', 'vertical')

				$svg = $sel.append('svg').attr('class', 'pudding-chart');
				$axis = $svg.append('g').attr('class', 'g-axis');
				const $g = $svg.append('g');

				// offset chart for margins
				$g.attr('transform', `translate(${marginLeft}, ${marginTop})`);

				// create axis
				xAxisGroup = $axis.append('g')
					.attr('class', 'x axis')

				yAxisGroup = $axis.append('g')
					.attr('class', 'y axis')

				$fLabel = $g.append('text').attr('class', 'f-label').text('Women')
				$mLabel = $g.append('text').attr('class', 'm-label').text('Men')

				$biggerLabelGroup = $svg.append('g')
				$smallerLabelGroup = $svg.append('g')

				$biggerLabel = $biggerLabelGroup.append('text')
						.text('Bigger median hair')
						.attr('class', 'axis-label bigger-axis-label')

				$smallerLabel = $smallerLabelGroup.append('text')
						.text('Smaller median hair')
						.attr('class', 'axis-label smaller-axis-label')

				$upArrow = $biggerLabelGroup.append('svg:image')
						.attr('xlink:href', `assets/images/arrow-up.svg`)
						.attr('width', '20px')
						.attr('height', '20px')

				$downArrow = $smallerLabelGroup.append('svg:image')
						.attr('xlink:href', `assets/images/arrow-down.svg`)
						.attr('width', '20px')
						.attr('height', '20px')

				// setup viz group
				$vis = $g.append('g').attr('class', 'g-vis');

				lineGroup = $svg.select('.g-vis')

				femaleLine = lineGroup.append('path')
					.datum(femaleData)
					.attr('class', 'Female')

				maleLine = lineGroup.append('path')
					.datum(maleData)
					.attr('class', 'Male')

				drawArea = $vis.append('path')
					.datum(dataByYear)
					.attr('class', 'area')

				Chart.resize();
				Chart.render();
			},
			// on resize, update new dimensions
			resize() {
				// defaults to grabbing dimensions from container element
				width = $sel.node().offsetWidth - marginLeft - marginRight;
				height = $sel.node().offsetHeight - marginTop - marginBottom;
				$svg
					.attr('width', width + marginLeft + marginRight)
					.attr('height', height + marginTop + marginBottom);

				getTicks(width)

				xScale
					.domain([minX, maxX])
					.range([0, width])

				yScale
					.domain([0, maxY])
					.range([height, 0])

				xAxis = d3
					.axisBottom(xScale)
					.tickPadding(axisPadding)
					.ticks(numTicks)
					.tickFormat(d3.format('d'))

				yAxis = d3
					.axisLeft(yScale)
					.tickPadding(axisPadding)
					.tickSize(-width)
					.ticks(8)

				$axis.select('.x')
					.attr('transform', `translate(${marginLeft},${height - marginBottom + axisPadding})`)
					.call(xAxis);

				$axis.select('.x.axis .tick text').attr('transform', `translate(20,0)`)

				$axis.select('.y')
					.attr('transform', `translate(${marginLeft},0)`)
					.call(yAxis);

				genderLines = d3.line()
					.x(d => xScale(d.year))
					.y(d => yScale(d.smoothed))

				maleLine
					.attr('d', genderLines)

				femaleLine
					.attr('d', genderLines)

				genderArea = d3.area()
					.x(d => xScale(d.key))
					.y0(d => yScale(d.value.female))
					.y1(d => yScale(d.value.male))

				drawArea.attr('d', genderArea)

				$svg
					.on('mousemove', lineMouseMove)
					.on('mouseover', lineMouseMove)
					.on('mouseout', lineMouseOut)

				$fLabel
					.attr('x', width)
					.attr('y', 30)

				$mLabel
					.attr('x', 0)
					.attr('y', height/1.5)

				$biggerLabelGroup.attr('transform', `translate(0,${axisPadding*1.5})`)
				$biggerLabel.attr('transform', `translate(25,0)`)
				$upArrow.attr('transform', `translate(0,-15)`)

				$smallerLabelGroup.attr('transform', `translate(0,${height - axisPadding/2})`)
				$smallerLabel.attr('transform', `translate(25,0)`)
				$downArrow.attr('transform', `translate(0,-15)`)

				return Chart;
			},
			// update scales and render chart
			render() {
				return Chart;
			},
			// get / set data
			data(val) {
				if (!arguments.length) return data;
				data = val;
				$sel.datum(data);
				Chart.render();
				return Chart;
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
  <omitted path="vendor/d3.v5.11.0.min.js">Locally shipped runtime build or library dependency; readable author components and styles are included in this bundle.</omitted>
</sample>
