/* The original D3 line/area construction. Year selection and photos are owned by app.js. */
d3.selection.prototype.puddingTrendLines = function () {
  function createChart(element) {
    const container = d3.select(element);
    const data = container.datum()[0].map(row => ({...row, year:+row.year, smoothed:+row.smoothed}));
    const female = data.filter(row => row.gender === 'Female');
    const male = data.filter(row => row.gender === 'Male');
    const byYear = d3.nest().key(row => row.year).rollup(rows => ({
      female: rows.find(row => row.gender === 'Female').smoothed,
      male: rows.find(row => row.gender === 'Male').smoothed
    })).entries(data);
    const x = d3.scaleLinear().domain(d3.extent(data, row => row.year));
    const y = d3.scaleLinear().domain([0, d3.max(data, row => row.smoothed)]);
    container.append('div').attr('class','tooltip');
    container.append('div').attr('class','vertical');
    const svg = container.append('svg').attr('class','pudding-chart');
    const axes = svg.append('g').attr('class','g-axis');
    const xAxis = axes.append('g').attr('class','x axis');
    const yAxis = axes.append('g').attr('class','y axis');
    const plot = svg.append('g').attr('transform','translate(0, 10)');
    const femaleLabel = plot.append('text').attr('class','f-label').text('Women');
    const maleLabel = plot.append('text').attr('class','m-label').text('Men');
    const bigger = svg.append('g');
    const smaller = svg.append('g');
    for (const [group, name, direction] of [[bigger,'Bigger','up'],[smaller,'Smaller','down']]) {
      group.append('text').attr('class',`axis-label ${name.toLowerCase()}-axis-label`)
        .text(`${name} median hair`).attr('transform','translate(25,0)');
      group.append('svg:image').attr('xlink:href',`assets/images/arrow-${direction}.svg`)
        .attr('width','20px').attr('height','20px').attr('transform','translate(0,-15)');
    }
    const visual = plot.append('g').attr('class','g-vis');
    const femaleLine = visual.append('path').datum(female).attr('class','Female');
    const maleLine = visual.append('path').datum(male).attr('class','Male');
    const area = visual.append('path').datum(byYear).attr('class','area');
    function resize() {
      const width = element.offsetWidth, height = element.offsetHeight - 30;
      svg.attr('width',width).attr('height',height+30);
      x.range([0,width]);y.range([height,0]);
      xAxis.attr('transform',`translate(0,${height-5})`)
        .call(d3.axisBottom(x).tickPadding(15).ticks(width>640?10:5).tickFormat(d3.format('d')));
      axes.select('.x.axis .tick text').attr('transform','translate(20,0)');
      yAxis.attr('transform','translate(0,0)')
        .call(d3.axisLeft(y).tickPadding(15).tickSize(-width).ticks(8));
      const line = d3.line().x(row=>x(row.year)).y(row=>y(row.smoothed));
      femaleLine.attr('d',line);maleLine.attr('d',line);
      area.attr('d',d3.area().x(row=>x(row.key)).y0(row=>y(row.value.female)).y1(row=>y(row.value.male)));
      femaleLabel.attr('x',width).attr('y',30);
      maleLabel.attr('x',0).attr('y',height/1.5);
      bigger.attr('transform','translate(0,22.5)');
      smaller.attr('transform',`translate(0,${height-7.5})`);
      return api;
    }
    const api = {resize};resize();return api;
  }
  const charts = this.nodes().map(createChart);
  return charts.length===1?charts[0]:charts;
};
