from pathlib import Path
p=Path('experiments/mini-size-budget/author/artist-repetition-lab/src/basechart.js');s=p.read_text()
a=s.index('  constructor(rootsel, kwargs={})');b=s.index('    this.W =',a)
s=s[:a]+'''  constructor(rootsel) {
    this.root = d3.select(rootsel);
    this.margin = {top:20,right:20,bottom:50,left:20};
    this.totalW = this.root.node().offsetWidth;
    this.totalH = 520;
'''+s[b:]
a=s.index('    let R = isMobile()');b=s.index("    this._svg.classed",a)
s=s[:a]+'''    let R = 27;
    super(rootsel);
'''+s[b:];p.write_text(s)
p=Path('experiments/mini-size-budget/author/artist-repetition-lab/src/discog.js');s=p.read_text();a=s.index('    newbars\n      .attr("x"');b=s.index('\n  }',a)
s=s[:a]+'''    const paint = selection => selection
      .attr('x', h => this.xscale(h.left))
      .attr('y', h => this.H/2 - hscale(h.count)/2)
      .attr('width', h => this.xscale(h.right)-this.xscale(h.left))
      .attr('height', h => hscale(h.count));
    paint(newbars);
    paint(bars.transition().duration(300));'''+s[b:];p.write_text(s)
p=Path('experiments/mini-size-budget/author/artist-repetition-lab/src/basechart.js');s=p.read_text();a=s.index('  get extent()');b=s.index('\n}',a);p.write_text(s[:a]+s[b:])
