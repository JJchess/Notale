/* Compact adaptation of the original fit chart; original source and license retained in provenance. */
d3.selection.prototype.fitChart = function init(options) {
	function createChart(el) {
		const $sel = d3.select(el);
		let data = $sel.datum();
		let width = 0;
		let height = 0;
		const marginTop = 50;
		const marginBottom = 0;
		const marginLeft = 0;
		const marginRight = 0;
		const scale = d3.scaleLinear()
		const padding = 10
		const inch = 0.393
		function multRectX(val, newWidth){
			const conv = (newWidth * val) / 225
			return conv
		}
		function multRectY(val, newWidth){
			const conv = (newWidth * val) / 175
			return conv
		}
		let $svg = null;
		let $vis = null;
    let display = null
    let brands = null
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
        // Original measured pocket outline; the cutout inserts its extra edge.
        function pocketShape(sel, d) {
          const origin = [padding, padding];
          const bottom = [padding, padding + scale(d.maxHeightFront)];
          const end = [padding + scale(d.maxWidthFront), scale(d.minHeightFront) + padding];
          const rivet = [padding + scale(d.maxWidthFront), scale(d.rivetHeightFront) + padding];
          const lipControl = [padding + scale((d.maxWidthFront - d.minWidthFront) * 1.5), scale(d.rivetHeightFront) + padding];
          const lipEnd = [padding + scale(d.maxWidthFront - d.minWidthFront), padding];
          const path = ['M', origin, 'L', bottom];
          if (d.cutout == 'TRUE') {
            path.push('L', [padding + scale(d.maxWidthFront - 3), scale(d.maxHeightFront) + padding],
              'Q', [padding + scale(d.maxWidthFront * .8), scale(d.maxHeightFront * .8) + padding], end);
          } else {
            path.push('Q', [padding + scale(d.maxWidthFront / 2), scale(d.maxHeightFront + 2) + padding], end);
          }
          return path.concat(['L', rivet, 'Q', lipControl, lipEnd, 'L', origin]).join(' ');
        }

		function drawPocket(d){
			let g = d3.select(this)
			const drawnPocket = g
				.append('path.outline')
		}
    const rectangleFields = {phone: 'rectanglePhone', pen: 'rectanglePen', wallet: 'rectangleWallet', hand: 'rectangleHand'};
    function drawObject(d, kind, group, id) {
      const object = objectMap.get(id), rect = d[rectangleFields[kind]];
      const hand = kind === 'hand';
      const objectWidth = scale(object.width);
      const imageWidth = hand ? scale(object.fingerWidth) : objectWidth;
      const imageHeight = scale(hand ? object.fingerHeight : object.height);
      const x = multRectX(rect.points[0][0], width) + (hand ? (imageWidth - objectWidth) / 2 : 0);
      const y = multRectY(rect.points[0][1], height);
      group.append('svg:image').attr('width', imageWidth).attr('height', imageHeight)
        .attr('xlink:href', `assets/images/${id}.png`).attr('transform-origin', 'top left')
        .attr('transform', `translate(${x}, ${y})rotate(${rect.angle})`).attr('class', 'pocket-object');
    }
    const objectMap = d3.map(objectSizes, d => d.id)
		const Chart = {
			init() {
				$sel.attr('class', d => `chart chart-${d.key}`)
        $sel.append('text.text-menWomen')
          .text(d => `${d.key}'s`)
        const container = $sel.append('div.container')
				brands = container.selectAll('.fit-brand')
          .data(d => d.values)
          .enter()
          .append('div.area-front')
          .attr('class', d => `fit-brand visible ${d.menWomen}`)
        display = brands.append('div.display')
        $svg = display.append('svg.fit-canvas')
        const text = display.append('div.text')
				const leftText = text.append('div.leftText')
				const rightText = text.append('div.rightText')
        leftText.append('text.style').text(d => d.updatedStyle)
				leftText.append('text.brand').text(d => d.brand)
				rightText.append('text.tag').text(d => (d.menWomen).substring(0, 1))
 const $g = $svg.append('g');
				$vis = $g.append('g.g-vis');
				Chart.resize();
				Chart.render();
			},
			resize() {
				const chartWidth = 225
				const blocks = $sel.selectAll('.fit-brand')
					.st('width', chartWidth)
					.st('height', d3.round(chartWidth * 1.33, 0))
				blocks.selectAll('.display')
					.st('width', chartWidth)
					.st('height', d3.round(chartWidth * 1.33, 0))
				width = blocks.node().offsetWidth - marginLeft - marginRight;
				height = (width) - marginTop - marginBottom
				$svg.at({
					width: width + marginLeft + marginRight,
					height: height + marginTop + marginBottom
				});
				scale
					.domain([0, 29])
					.range([0, height])
				const outlines = $sel.selectAll('.outline')
				if (outlines.size() > 0){
					Chart.update()
				}
				return Chart;
			},
			render() {
        const frontGroup = $svg.select('.g-vis')
        frontGroup
          .selectAll('.outline')
          .data(d => [d])
          .enter()
          .append('g')
					.each(drawPocket)
          for (const [measurement, anchor] of [['maxHeight','end'], ['minHeight','start'], ['maxWidth','middle'], ['minWidth','middle']]) {
            frontGroup.append('text')
              .text(d => `${d3.round(d[measurement + 'Front'] * inch, 1)}"`)
              .attr('alignment-baseline', 'hanging').attr('text-anchor', anchor)
              .attr('class', `tk-atlas measure measure-${measurement}`);
          }

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
      toggle(brand, price, style) {
        brands.classed('visible', d =>
          (brand === 'All brands' || d.brand === brand) &&
          (style === 'All styles' || d.updatedStyle === style) &&
          (price === 'All prices' || d.priceGroup === price));
        // The page controller owns empty results and expand/collapse controls.
        return Chart;
      },
      dim(selObject, id, state){
				const frontGroup = $svg.select('.g-vis')
				if (state == false){
					brands
	          .select('.display')
	          .classed('dimmed', function(d){
            const rectArea = rectangleFields[selObject];
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
	        frontGroup.selectAll('.pocket-object').remove()
	        frontGroup.each(function(d){
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
	const charts = this.nodes().map(createChart);
	return charts.length > 1 ? charts : charts.pop();
};
