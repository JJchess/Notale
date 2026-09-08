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
