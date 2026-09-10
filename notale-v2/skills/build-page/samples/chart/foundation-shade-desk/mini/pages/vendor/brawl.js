/* Original Beauty Brawl geometry and bins, with the unused article controller removed.
   Data, fonts, images and upstream license remain in this sample's provenance. */
d3.selection.prototype.brawl = function () {
  function createChart(container) {
    const chart = d3.select(container).select('.brawl');
    let data = chart.datum();

    function render() {
      const products = d3.nest().key(row => row.product_short).entries(data)
        .map(product => ({
          key: product.key,
          values: {
            total: product.values.length,
            group: d3.range(10).map(bin => ({
              key: String(bin),
              values: product.values.filter(row => String(row.lightnessGroup) === String(bin))
            }))
          }
        }))
        .sort((a, b) => d3.descending(a.values.total, b.values.total));
      const brandsByProduct = d3.map(data, row => row.product_short);
      chart.selectAll('.all-brands').remove();
      const brands = chart.append('div').attr('class', 'all-brands')
        .selectAll('.bin-brand').data(products).enter().append('div')
        .attr('class', product => `bin-brand bin-brand-${product.key}`)
        .attr('data-brand', (_, index) => index);
      const titles = brands.append('div').attr('class', 'bin-brandTGroup');
      titles.append('text').attr('class', 'bin-brandTitle')
        .text(product => brandsByProduct.get(product.key).brand);
      titles.append('text').attr('class', 'bin-brandProduct')
        .text(product => `${brandsByProduct.get(product.key).product} • ${product.values.total}`);
      titles.append('text').attr('class', 'bin-brandTotal')
        .text(product => `${product.values.total} shades`);

      const bins = brands.selectAll('.bin-category')
        .data(product => product.values.group).enter().append('div')
        .attr('class', (_, index) => `bin-category bin-category-${index}`);
      bins.append('div').attr('class', 'bin-swatchGroup')
        .selectAll('.bin-swatch').data(bin => bin.values).enter().append('div')
        .attr('class', shade => `bin-swatch bin-swatch-${shade.L}`)
        .style('background-color', shade => `#${shade.hex}`);
      // The source opacity scale is linear, with 18 shades representing opacity 1.
      bins.append('div').attr('class', 'bin-numGroup')
        .style('background-color', bin => `rgba(252, 203, 49, ${bin.values.length / 18})`)
        .append('text').attr('class', bin => `bin-num bin-num-${bin.values.length}`)
        .text(bin => bin.values.length);

      if (chart.select('.bin-labelGroup').empty()) {
        const labels = chart.append('div').attr('class', 'bin-labelGroup');
        labels.append('div').attr('class', 'bin-labelTGroup')
          .selectAll('text').data(['Lightness', 'Range']).enter().append('text')
          .attr('class', 'bin-labelTitle').text(label => label);
        labels.selectAll('.bin-labelCat').data(d3.range(10)).enter().append('div')
          .attr('class', 'bin-labelCat').append('text').attr('class', 'bin-label')
          .text(bin => `${bin * 10} - ${bin * 10 + 10}`)
          .attr('alignment-baseline', 'middle').attr('text-anchor', 'middle');
      }
      return api;
    }
    const api = {
      render,
      resize() { return api; }, // Column dimensions and mobile scrolling are CSS-owned.
      data(value) {
        if (!arguments.length) return data;
        data = value;
        chart.datum(data);
        return render();
      }
    };
    render();
    return api;
  }
  const charts = this.nodes().map(createChart);
  return charts.length === 1 ? charts[0] : charts;
};
