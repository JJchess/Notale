<sample id="artist-repetition-lab" category="chart" variant="full">
  <file path="samples/chart/artist-repetition-lab/pages/index.html">
```html
<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Artist Repetition Lab · Sample</title><link rel="stylesheet" href="style.css"><body><main><header><a href="../../../../../index.html" target="_top">← Samples</a><span>THE PUDDING / SOURCE STUDY / 2017</span></header><section class="intro"><p class="eyebrow">AN EXERCISE IN LANGUAGE COMPRESSION</p><h1>One artist.<br>Many kinds of repetition.</h1><p>Each circle is a song. The pale shape is the original distribution of roughly 15,000 charting songs. Further right means the lyrics compress into less space.</p><p class="credit">Original research & visualization by <a href="https://pudding.cool/2017/05/song-repetition/" target="_blank" rel="noopener">Colin Morris / The Pudding ↗</a> · <a href="SAMPLE.md">Review notes</a></p></section><section class="toolbar" aria-label="Artist selection"><label>Find an artist<input id="search" type="search" placeholder="Search 461 artists…"></label><label>Artist<select id="artist"></select></label><button id="random">Random artist</button><button id="reset">Gwen Stefani</button><span id="matches" aria-live="polite"></span></section><nav id="examples" aria-label="Example artists"><button>Taylor Swift</button><button>Madonna</button><button>J. Cole</button><button>Eminem</button><button>Rihanna</button></nav><div class="chart-heading"><p id="song-count" aria-live="polite">Loading original data…</p><p class="mobile-hint">Swipe the chart horizontally; each circle keeps its original readable size.</p></div><div class="chart-scroll" tabindex="0" aria-label="Scrollable artist discography chart"><div id="discog-widget"></div></div><div id="song-detail" role="status">Select a song to read its title, year and compression rate.</div><details><summary>All songs in this selection</summary><div id="song-list"></div></details><footer>The chart measures lyric compression, not musical quality. The horizontal scale preserves the original logarithmic relationship; the median and background always refer to the full original dataset. These are the songs available to the 2017 study, not a complete or current discography.</footer></main><script src="app.js"></script></body></html>
```
  </file>
  <file path="samples/chart/artist-repetition-lab/pages/src/basechart.js">
```javascript
import * as d3 from 'd3';
import * as c from './constants.js';
import * as comm from './common.js';
import { isMobile } from './helpers.js';

class BaseChart {
  constructor(rootsel, kwargs={}) {
    this.rootsel = rootsel;
    this.root = d3.select(rootsel);
    this.margin = {top: 20, right: 20, bottom: 50, left: 20};
    if (isMobile()) {
      this.margin.left = 0;
      this.margin.right = 0;
    }
    Object.assign(this.margin, kwargs.margin);
    if (kwargs.W) {
      this.totalW = kwargs.W;
    } else {
      this.totalW = this.root.node().offsetWidth;
    }
    if (kwargs.H) {
      this.totalH = kwargs.H;
    } else {
      // TODO: probably clearer and less dangerous to do this with css, using
      // vh units
      this.totalH = Math.min(
          800,
          window.innerHeight * (kwargs.hfrac || .66)
      );
      this.totalH = Math.max(
          this.totalH,
          kwargs.hmin || 300
      );
    }
    this.W = this.totalW - this.margin.left - this.margin.right;
    this.H = this.totalH - this.margin.top - this.margin.bottom;
    this._svg = this.root.append('svg')
      .attr('width', this.totalW)
      .attr('height', this.totalH)
    this.svg = this._svg
      .append("g")
        .attr("transform", "translate(" + this.margin.left + " " + this.margin.top + ")");
  }

  resizeHeight(h, duration=0) {
    this.totalH = h;
    this.H = this.totalH - this.margin.top - this.margin.bottom;
    this._svg.transition()
      .duration(duration)
      .attr('height', this.totalH)
    ;
  }
}

class BeeswarmChart extends BaseChart {

  constructor(rootsel) {
    let R = isMobile() ? 22 : 27; // radius of circles
    let kwargs = {
      hmin: (R*2)*9,
    };
    super(rootsel, kwargs);
    this._svg.classed('beeswarm', true);
    this.R = R;

    this.xscale = d3.scaleLinear()
      .domain(this.extent)
      .range([this.R, this.W-this.R]);
    this.yscale = d3.scaleLinear()
      .domain([-1, 1])
      .range([this.H-this.R, this.R]);
    this.addAxis();

  }

  get ylabel() {
    return 'Size Reduction';
  }

  // render the x-axis
  addAxis() {
    let y = this.H;
    let labely = 40;
    this._svg.append("g")
      .classed("axis", true)
      .attr("transform", "translate(0 "+y+")")
      .append('text')
      .classed('label', true)
      .attr('transform', `translate(${this.W/2}, ${labely})`)
      .text(this.ylabel)
    this.updateAxis();
  }

  updateAxis() {
    let axis_el = this._svg.select('.axis');
    let axis = d3.axisBottom(this.xscale)
      .tickSizeOuter(0)
      .tickSizeInner(4)
      .tickPadding(6)
      .tickFormat(comm.rscore_to_readable);
    axis_el.call(axis);
  }

  /** Arrange text into the given text elements, such that they satisfactorily
   * fit into an enclosing 'bubble'. This may involve splitting text across
   * lines (using tspans) and possibly using a font size smaller than the one
   * suggested, or truncating some of the text.
   * - textsel is a selection of text elements, bound to some data.
   * - textgetter maps a bound datum on a text element to the associated
   *   text that should be drawn in the bubble
   * - fontsize is assumed to be in px. (Currently only used for line
   *   spacing. When we alter the font-size of the given text eles, we
   *   set it in % units)
   */
  bubbleText(textsel, textgetter, fontsize=11) {
    let linedat = textsel.data().map(d => this.linify(textgetter(d)));
    // Reduce font size per text according to max constraint violation
    let fontscale = d3.scaleLinear()
      .clamp(true)
      // No constraint violation: full font size. Exceeding the soft limit
      // on number of chars per line by 7 or more? 2/3 font size.
      .domain([0, 7])
      .range(['100%', '65%']);
    let fontsizer = (d,i) => fontscale(linedat[i].violation);
    textsel.style('font-size', fontsizer);

    let spans = textsel.selectAll('tspan')
      .data( (d,i) => linedat[i].lines );
    spans.exit().remove();
    let newspans = spans.enter().append('tspan');
    let lineheight = fontsize*1.05;
    spans.merge(newspans)
      .attr('fill', 'black')
      .attr("x", 0)
      .attr("y", (d,i,n) => {
        let nlines = n.length;
        let height = nlines * lineheight;
        // -height/2 would make sense if text grew down from its y-coordinate,
        // but actually, the base of each letter is aligned with the y-coord
        let offset = -height/2 + lineheight/2;
        return offset + i*lineheight;
      })
      .text((d)=>d)
  }
  /** Return a list of word-wrapped lines that sum to the given text.
   * Given max length is treated as a soft constraint. */
  linify(s, maxlen=6) {
    // if we're going to go past one of these limits, we just give up and
    // stick in an ellipsis
    // (Also, yeah, I know, counting characters is imperfect here cause I'm
    // not using a monospace font, but the alternative of continually rendering
    // and checking sizes sounds tedious, and possibly slow)
    const hardlimit = {chars: 20, lines: 5};
    let tokens = s.split(' ');
    // this is an optimistic estimate
    let tentativesize = d3.sum(tokens, t=>t.length);
    // Basic idea here is that, if we know we're going to have to cut this
    // off early, then do it plenty early. Avoid the awkward situation where
    // the title came in just over the limit, and we end up rendering almost
    // the whole title, except a tiny bit at the end that gets ellipsised
    // (e.g. "Bang Bang (My Baby Show Me...")
    const charlimit = tentativesize > hardlimit.chars ?
      hardlimit.chars*.66 : 100;
    let lines = [];
    let line = '';
    let violation = 0;
    console.assert(maxlen > 0);
    let i = 0;
    let totallen = 0;
    let fedup = false;
    for (let token of tokens) {
      let wordsleft = (i+1) < tokens.length;
      // We've hit our hard limit. Add an ellipsis then peace out.
      if (wordsleft && totallen > charlimit) {
        fedup = true;
        line += '...';
      } else {
        line += token + ' ';
      }
      if (line.length >= maxlen || fedup ||
          // look ahead for icebergs
          (line.length && wordsleft &&
            (line.length + tokens[i+1].length) > maxlen * 1.33
          )
       )
      {
        line = line.slice(0,-1);
        if (!fedup && lines.length+1 >= hardlimit.lines) {
          line += '...';
          fedup = true;
        }
        lines.push(line)
        let len = line.length;
        violation = Math.max(violation, len-maxlen);
        totallen += len;
        line = '';
      }
      i++;
      if (fedup) break;
    }
    if (line) {
      lines.push(line);
    }
    return {lines, violation};
  }

  get extent() {
    return d3.extent(this.currData, this.getx);
  }
  get currData() {
    console.error('subclass must implement');
  }

  getx(datum) {
    console.error('subclass must implement');
  }
  datx(datum) {
    return this.xscale(this.getx(datum));
  }
}

export { BeeswarmChart, BaseChart };
```
  </file>
  <file path="samples/chart/artist-repetition-lab/pages/src/common.js">
```javascript
import * as d3 from 'd3';

// Quantiles of repetition score
const pctiles = {
  .1: 0.181736,
  .5: 0.258959,
  1 : 0.298361,
  10: 0.5388,
  50: 0.9733,
  90: 1.467,
  99: 1.9997,
  99.5: 2.147265,
  99.9: 2.695442,
};

const rscore_cmap = d3.scaleSequential(d3.interpolateViridis)
  .domain([pctiles[99.5], pctiles[.5]])

function round(x, places=2) {
  let n = Math.pow(10, places);
  return Math.round(x*n)/n;
}

// actually fraction <1, not pct
function rscore_to_pct(rscore) {
  // using rscore gives the raw size as % of compressed (generally > 100%),
  // using -rscore gives compressed size as % of raw (< 100)
  return 1 - Math.pow(2, -rscore);
}

function pct_to_rscore(pct) {
  let frac = pct/100;
  return -1 * Math.log2(1-frac);
}

function rscore_to_readable(rscore, places=0) {
  const formatter = d3.format('.0%');
  return formatter(rscore_to_pct(rscore));
}


export {rscore_to_readable, rscore_to_pct, pct_to_rscore, pctiles, rscore_cmap,
};
```
  </file>
  <file path="samples/chart/artist-repetition-lab/pages/src/constants.js">
```javascript
const runits = 'pct';

const year_extent = [1960, 2015];
const minyear = year_extent[0];
const maxyear = year_extent[1];

const decades = [];
for (let d=6; d<=11; d++) {
  let name;
  if (d === 11) {
    name = "'10s";
  } else if (d === 10) {
    name = "'00s";
  } else {
    name = "'" + d*10 + "s";
  }
  let decade = {earliest: 1900+d*10, latest: 1900+d*10+9, name: name};
  decades.push(decade);
}

const pseudo_decades = decades;
pseudo_decades.push(
    {earliest: minyear, latest: maxyear, name: 'All Decades'}
);
pseudo_decades.reverse();

export {runits, year_extent, minyear, maxyear, pseudo_decades};
```
  </file>
  <file path="samples/chart/artist-repetition-lab/pages/src/discog.js">
```javascript
/** Widget for showing repetitiveness of an individual artist's discography
 */
import * as d3 from 'd3';




import * as comm from './common.js';
import { BeeswarmChart } from './basechart.js';

import ARTIST_LOOKUP from './starmap.js';
import HIST from './histogram-data.js';




const DEBUG_DISPLACEMENT = false;

const DEFAULT_ARTIST = 'Gwen Stefani';

// If an artist has at least this many songs, grow the height to accomodate all the
// circles.
const BIG_DISCOGRAPHY = 40;
// How much to multiply the base height by when expanding to accomodate a big discography.
const GROWTH_FACTOR = 1.3;

// Default limits for the rscore axis
const RLIM = [comm.pctiles[10], comm.pctiles[90]];
//const RLIM = [comm.pctiles[1], comm.pctiles[99]];

function songToolTip(s) {
  return `<div class="d3-tip">
      <div>${s.title} (${Math.floor(s.yearf)})</div>
      <div style="text-align: center;">${comm.rscore_to_readable(s.rscore)} compressed</div>
      </div>`;
}

class DiscogWidget extends BeeswarmChart {

  // TODO: a general pattern worth trying: use setters to handle the rerendering
  // associated with certain state changes (setting beehive, setting artist, etc.)
  constructor() {
    let rootsel = '#discog-widget';
    super(rootsel);
    this.tip = {show: d => window.showSong(d), hide: () => {}};
    let insert = elem => this.root.insert(elem, ":first-child");

    let controls = insert("div");
    insert('h1');
    let head = this.setupHeader();
    head.append("button")
      .text("random")
      .on("click", ()=> {
        this.updateArtist();
        this.updateHeader();
      });
    this.originalHeight = this.totalH;
    
    // Whether we've grown this figure's height to accomodate a big discography.
    this.expanded = false;
    this.setupAxes();
    this.updateArtist(DEFAULT_ARTIST);
    this.bindLinks();
  }

  resizeHeight(h, duration=0) {
    super.resizeHeight(h, duration);
    this.yscale.range([this.H-this.R, this.R]);
    this._svg.select('.axis')
      .transition()
      .duration(duration)
      .attr('transform', `translate(0 ${this.H})`);
    let offset = 50;
    // This doesn't work as a transition. Just does nothing. I have nooooo idea why.
    this.svg.selectAll('.baseline')
      .select('line')
      .attr('y1', this.H-offset)
      .attr('y2', offset)

    this.updateHistogram();
  }

  // Add click callbacks to the link elements in the later prose which are supposed
  // to have the effect of jumping to a particular artist.
  bindLinks() {
    d3.select('#discog-examples').selectAll('button')
      .on('click', (d,i,n) => this.jumpToArtist(n[i].textContent));
  }

  jumpToArtist(artist) {
    this.updateArtist(artist);
    this.updateHeader();
    document.querySelector(this.rootsel).scrollIntoView({block:'nearest'});
  }

  get extent() {
    return RLIM;
  }
  getx(datum) { return datum.rscore; }

  // TODO: this is all kind of a mess right now. Need to structure it better
  // and make it more d3 idiomatic
  setupAxes() {
    let offset = 50;
    //let marker_pctiles = [10, 50, 90];
    let marker_pctiles = [50];
    let base = this.svg.selectAll(".baseline").data(marker_pctiles)
      .enter()
      .append("g")
      .classed("baseline", true);
    base.append("line")
      .attr("x1", (k)=>this.xscale(comm.pctiles[k]))
      .attr("y1", this.H-offset)
      .attr("x2", (k)=>this.xscale(comm.pctiles[k]))
      .attr("y2", offset)
      .attr("stroke", "black")
      .attr("stroke-width", 1);
    base.append("text")
      .attr("text-anchor", "middle")
      .attr("x", (k)=>this.xscale(comm.pctiles[k]))
      .attr("y", offset-5)
      .attr("font-size", 12)
      .text((k) => (k === 50 ? "median" : k+"%"));
  }

  updateAxes() {
    // TODO: I think this is redundant wrt parent class's updateAxis method?
    this._svg.select('.axis')
        .call(d3.axisBottom(this.xscale)
            .tickSizeOuter(0)
            .tickSizeInner(4)
            .tickPadding(6)
            .tickFormat(comm.rscore_to_readable)
            //.ticks(0)
            );

    this.svg.selectAll('.baseline').select('line')
      .transition()
      .duration(1000)
      .attr("x1", (k)=>this.xscale(comm.pctiles[k]))
      .attr("x2", (k)=>this.xscale(comm.pctiles[k]));
    this.svg.selectAll('.baseline').select('text')
      .transition()
      .duration(1000)
      .attr("x", (k)=>this.xscale(comm.pctiles[k]));

  }

  updateHistogram() {
    // map counts to height of bar
    let hdomain = [0, d3.max(HIST, h=>h.count)];
    let hscale = d3.scaleLinear()
      .domain(hdomain)
      .range([0, this.H*8/10]);
    let bars = this.svg.selectAll('.bar').data(HIST);
    bars.exit().remove();
    let newbars = bars.enter()
      .append('rect')
      .classed('bar', true);
    newbars.merge(bars)
      .attr('fill', h => comm.rscore_cmap((h.left+h.right)/2) )
      .attr('opacity', 0.2);
    newbars
      .attr("x", h=> this.xscale(h.left))
      // start at the midpoint, then move up half the height of the bar
      // (the goal is for the bars to be symmetric about the x-axis, which
      // is located at the midpoint of the y-axis)
      .attr("y", h=> this.H/2 - hscale(h.count)/2)
      .attr("width", h=> this.xscale(h.right)-this.xscale(h.left))
      .attr("height", h=> hscale(h.count));
    bars.transition()
      .duration(300)
      .attr("x", h=> this.xscale(h.left))
      .attr("y", h=> this.H/2 - hscale(h.count)/2)
      .attr("width", h=> this.xscale(h.right)-this.xscale(h.left))
      .attr("height", h=> hscale(h.count));
  }

  // Called to adjust circle positions when force simulation ticks
  nudge() {
    this.svg.selectAll(".song")
      .attr("transform", (d)=>("translate("+d.x+" "+d.y+")"));
  }

  setupHeader() {
    const hd = this.root.select('h1');hd.text('Artist Discography');
    return hd;
  }

  // Called when the artist is changed by some means other than the dropdown
  // (i.e. the randomize button)
  updateHeader() {
    document.querySelector('#artist').value = this.artist;
  }

  // Use the given artist's discog. (Or, if none given, choose a random artist.)
  updateArtist(artist) {
    if (!artist) {
      let tries = 4;
      let artists = Object.keys(ARTIST_LOOKUP);
      while (tries && (!artist || artist === this.artist)) {
        let i = Math.floor(Math.random()*artists.length);
        artist = artists[i];
        tries--;
      }
      if (tries === 0) {
        console.warn("Couldn't reroll a different artist. That's pretty weird.");
      }
    }
    this.artist = artist;
    let url = 'assets/discogs/' + ARTIST_LOOKUP[this.artist];
    const request = this.request = (this.request || 0) + 1;
    this.forcesim?.stop();
    return fetch(url).then(r => {if(!r.ok)throw Error('Data '+r.status);return r.json()}).then(discog => {
      if(request !== this.request)return;
      this.discog = discog;
      this.resizeIfNecessary(discog.length);
      this.renderSongs();
      this.svg.selectAll('.song').attr('tabindex',0).attr('role','button')
        .attr('aria-label',s => `${s.title}, ${Math.floor(s.yearf)}, ${comm.rscore_to_readable(s.rscore)} size reduction`)
        .on('focus',s=>window.showSong(s)).on('click',s=>window.showSong(s))
        .on('keydown',s=>{if(['Enter',' '].includes(d3.event.key)){d3.event.preventDefault();window.showSong(s)}});
      if(matchMedia('(prefers-reduced-motion: reduce)').matches){this.forcesim.stop();for(let i=0;i<110;i++)this.forcesim.tick();this.nudge()}
      document.querySelector('#song-count').textContent = `${artist} · ${discog.length} songs in the original dataset`;
      document.querySelector('#song-detail').textContent = 'Select a song to read its title, year and compression rate.';
      document.querySelector('#artist').value = artist;
      window.renderSongList(discog);
      this.loadedArtist=artist;
    });
  }

  resizeIfNecessary(nsongs) {
    let shouldExpand = nsongs >= BIG_DISCOGRAPHY;
    if (shouldExpand !== this.expanded) {
      //console.log(`Setting expand = ${shouldExpand} for discography with size ${nsongs}`);
      let h = this.originalHeight * (shouldExpand ? GROWTH_FACTOR : 1);
      this.resizeHeight(h, 500);
      this.expanded = shouldExpand;
    }
  }

  renderSongs() {
    let discog = this.discog;
    let xkey = (s) => (s.rscore);
    let rextent = d3.extent(discog, xkey);
    rextent[0] = Math.min(rextent[0], RLIM[0]);
    rextent[1] = Math.max(rextent[1], RLIM[1]);
    this.rextent = rextent;

    this.xscale = d3.scaleLinear()
      .domain(rextent)
      .range([this.R, this.W-this.R]);
    // TODO: enough reuse going on at this point to consider some kind of helper
    // base class/mixin. Lots of duplication with artists.js.
    this.xdat = (d) => (this.xscale(xkey(d)));
    this.updateAxes();
    this.updateHistogram();

    let iters = 100; // d3 default corresponds to 300
    let decay = 1 - Math.pow(0.001, 1/iters);
    this.forcesim = d3.forceSimulation()
      .force("x", d3.forceX(this.xdat).strength(1))
      .force("y", d3.forceY(this.yscale(0)))
      .force("collide", d3.forceCollide(this.R))
      .on("tick", ()=>{this.nudge()})
      .alphaDecay(decay)
      .nodes(discog)

    // Set initial position data
    // Add a bit of random jitter to initial y positions to break 
    // symmetry. 
    let jitterfn = d3.randomNormal(0, .1);
    discog.forEach(s=> {
      s.x = this.xdat(s);
      s.y = this.yscale(0+jitterfn());
    });

    let pts = this.svg.selectAll('.song').data(discog);
    pts.exit().remove();
    let newpts = pts
      .enter()
      .append("g")
      .on('mouseover', this.mouseover())
      .on('mouseout', this.mouseout())
      .classed("song bubble-container", true);
    let newcircles = newpts
      .append("circle")
      .attr("r", this.R)
      .attr("cx", 0)
      .attr("cy", 0)
    let fontsize = 10;
    let newtext = newpts
      .append("text")
      .classed("songlabel", true);
    pts = pts.merge(newpts);
    pts
      .attr("fill", s => comm.rscore_cmap(s.rscore));
    let textsel = pts.select('text');
    textsel
      .style("stroke", a=>d3.color(comm.rscore_cmap(a.rscore)).darker(1))
    this.bubbleText(textsel, d=>d.title);
  }

  // TODO: I miss being able to do arrow function methods. Should look into turning
  // that on in babel.
  // This was shunted to a helper factory method just because there's so much code.
  // Most of it is just a debugging tool (to see how far the forces move each point
  // from its original position)
  mouseover() {
    return (d,i,n) => {
      this.tip.show(d);
      if (DEBUG_DISPLACEMENT) {
        this.svg.select(".debugtrail").remove();
        this.svg.select(".ghost").remove();
        this.svg.append("line")
          .classed("debugtrail", true)
          .attr("stroke-width", 2)
          .attr("stroke", "black")
          .attr("x1", d.x)
          .attr("y1", d.y)
          .attr("x2", d.x)
          .attr("y2", d.y)
          .style('mouse-events', 'none')
          .transition()
          .ease(d3.easeLinear)
          .duration(500)
          .attr("x2", this.xdat(d))
          .attr("y2", this.yscale(0))
        this.svg
          .append("circle")
          .classed("ghost", true)
          .attr("r", this.R)
          .attr("opacity", 0)
          .attr("cx", this.xdat(d))
          .attr("cy", this.yscale(0))
          .attr("fill", "yellow")
          .style("mouse-events", "none")
          .transition()
          .delay(500)
          .duration(500)
          .attr("opacity", 0.5)
      }
    };
  }

  mouseout() {
    return (d,i,n) => {
      this.tip.hide(d);
      if (DEBUG_DISPLACEMENT) {
        this.svg.select(".debugtrail").remove();
        this.svg.select(".ghost").remove();
      }
    };
  }

  static init() {
    let disco = new DiscogWidget();
    return disco;
  }
}

export default DiscogWidget;
```
  </file>
  <file path="samples/chart/artist-repetition-lab/pages/src/helpers.js">
```javascript
import * as c from './constants.js';

function decade_controls(root) {
    return root.selectAll('a').data(c.pseudo_decades)
      .enter()
      .append('a')
      .classed('decade', true)
      .classed("front-curve",(d,i) => i === 0)
      .classed("back-curve",(d,i) => i === 6)
      .text(decade => decade.name)
}

function isMobile() {
  const bp = '(min-width: 768px)';
  return !window.matchMedia(bp).matches;
}

export { decade_controls, isMobile };
```
  </file>
  <file path="samples/chart/artist-repetition-lab/pages/src/histogram-data.js">
```javascript
var DATA = [
  {
    "count": 3, 
    "right": 0.11841010462141188, 
    "left": 0.079434467494404915
  }, 
  {
    "count": 4, 
    "right": 0.15738574174841885, 
    "left": 0.11841010462141188
  }, 
  {
    "count": 12, 
    "right": 0.19636137887542585, 
    "left": 0.15738574174841885
  }, 
  {
    "count": 27, 
    "right": 0.23533701600243281, 
    "left": 0.19636137887542585
  }, 
  {
    "count": 59, 
    "right": 0.27431265312943975, 
    "left": 0.23533701600243281
  }, 
  {
    "count": 91, 
    "right": 0.31328829025644678, 
    "left": 0.27431265312943975
  }, 
  {
    "count": 140, 
    "right": 0.35226392738345375, 
    "left": 0.31328829025644678
  }, 
  {
    "count": 190, 
    "right": 0.39123956451046071, 
    "left": 0.35226392738345375
  }, 
  {
    "count": 225, 
    "right": 0.43021520163746768, 
    "left": 0.39123956451046071
  }, 
  {
    "count": 229, 
    "right": 0.46919083876447465, 
    "left": 0.43021520163746768
  }, 
  {
    "count": 247, 
    "right": 0.50816647589148167, 
    "left": 0.46919083876447465
  }, 
  {
    "count": 333, 
    "right": 0.54714211301848859, 
    "left": 0.50816647589148167
  }, 
  {
    "count": 361, 
    "right": 0.5861177501454955, 
    "left": 0.54714211301848859
  }, 
  {
    "count": 409, 
    "right": 0.62509338727250263, 
    "left": 0.5861177501454955
  }, 
  {
    "count": 462, 
    "right": 0.66406902439950954, 
    "left": 0.62509338727250263
  }, 
  {
    "count": 501, 
    "right": 0.70304466152651646, 
    "left": 0.66406902439950954
  }, 
  {
    "count": 522, 
    "right": 0.74202029865352359, 
    "left": 0.70304466152651646
  }, 
  {
    "count": 537, 
    "right": 0.7809959357805305, 
    "left": 0.74202029865352359
  }, 
  {
    "count": 614, 
    "right": 0.81997157290753742, 
    "left": 0.7809959357805305
  }, 
  {
    "count": 604, 
    "right": 0.85894721003454433, 
    "left": 0.81997157290753742
  }, 
  {
    "count": 595, 
    "right": 0.89792284716155146, 
    "left": 0.85894721003454433
  }, 
  {
    "count": 596, 
    "right": 0.93689848428855838, 
    "left": 0.89792284716155146
  }, 
  {
    "count": 657, 
    "right": 0.97587412141556529, 
    "left": 0.93689848428855838
  }, 
  {
    "count": 669, 
    "right": 1.0148497585425724, 
    "left": 0.97587412141556529
  }, 
  {
    "count": 605, 
    "right": 1.0538253956695793, 
    "left": 1.0148497585425724
  }, 
  {
    "count": 613, 
    "right": 1.0928010327965862, 
    "left": 1.0538253956695793
  }, 
  {
    "count": 600, 
    "right": 1.1317766699235934, 
    "left": 1.0928010327965862
  }, 
  {
    "count": 550, 
    "right": 1.1707523070506003, 
    "left": 1.1317766699235934
  }, 
  {
    "count": 542, 
    "right": 1.2097279441776072, 
    "left": 1.1707523070506003
  }, 
  {
    "count": 448, 
    "right": 1.2487035813046141, 
    "left": 1.2097279441776072
  }, 
  {
    "count": 412, 
    "right": 1.2876792184316213, 
    "left": 1.2487035813046141
  }, 
  {
    "count": 396, 
    "right": 1.3266548555586282, 
    "left": 1.2876792184316213
  }, 
  {
    "count": 333, 
    "right": 1.3656304926856351, 
    "left": 1.3266548555586282
  }, 
  {
    "count": 276, 
    "right": 1.4046061298126422, 
    "left": 1.3656304926856351
  }, 
  {
    "count": 291, 
    "right": 1.4435817669396491, 
    "left": 1.4046061298126422
  }, 
  {
    "count": 210, 
    "right": 1.482557404066656, 
    "left": 1.4435817669396491
  }, 
  {
    "count": 208, 
    "right": 1.5215330411936629, 
    "left": 1.482557404066656
  }, 
  {
    "count": 192, 
    "right": 1.5605086783206701, 
    "left": 1.5215330411936629
  }, 
  {
    "count": 156, 
    "right": 1.599484315447677, 
    "left": 1.5605086783206701
  }, 
  {
    "count": 127, 
    "right": 1.6384599525746839, 
    "left": 1.599484315447677
  }, 
  {
    "count": 98, 
    "right": 1.677435589701691, 
    "left": 1.6384599525746839
  }, 
  {
    "count": 91, 
    "right": 1.716411226828698, 
    "left": 1.677435589701691
  }, 
  {
    "count": 72, 
    "right": 1.7553868639557049, 
    "left": 1.716411226828698
  }, 
  {
    "count": 91, 
    "right": 1.7943625010827118, 
    "left": 1.7553868639557049
  }, 
  {
    "count": 52, 
    "right": 1.8333381382097189, 
    "left": 1.7943625010827118
  }, 
  {
    "count": 47, 
    "right": 1.8723137753367258, 
    "left": 1.8333381382097189
  }, 
  {
    "count": 45, 
    "right": 1.9112894124637327, 
    "left": 1.8723137753367258
  }, 
  {
    "count": 38, 
    "right": 1.9502650495907399, 
    "left": 1.9112894124637327
  }, 
  {
    "count": 21, 
    "right": 1.9892406867177468, 
    "left": 1.9502650495907399
  }, 
  {
    "count": 29, 
    "right": 2.0282163238447537, 
    "left": 1.9892406867177468
  }, 
  {
    "count": 24, 
    "right": 2.0671919609717606, 
    "left": 2.0282163238447537
  }, 
  {
    "count": 12, 
    "right": 2.1061675980987675, 
    "left": 2.0671919609717606
  }, 
  {
    "count": 11, 
    "right": 2.1451432352257744, 
    "left": 2.1061675980987675
  }, 
  {
    "count": 10, 
    "right": 2.1841188723527818, 
    "left": 2.1451432352257744
  }, 
  {
    "count": 7, 
    "right": 2.2230945094797887, 
    "left": 2.1841188723527818
  }, 
  {
    "count": 10, 
    "right": 2.2620701466067956, 
    "left": 2.2230945094797887
  }, 
  {
    "count": 8, 
    "right": 2.3010457837338025, 
    "left": 2.2620701466067956
  }, 
  {
    "count": 6, 
    "right": 2.3400214208608094, 
    "left": 2.3010457837338025
  }, 
  {
    "count": 10, 
    "right": 2.3789970579878164, 
    "left": 2.3400214208608094
  }, 
  {
    "count": 4, 
    "right": 2.4179726951148233, 
    "left": 2.3789970579878164
  }, 
  {
    "count": 2, 
    "right": 2.4569483322418306, 
    "left": 2.4179726951148233
  }, 
  {
    "count": 3, 
    "right": 2.4959239693688375, 
    "left": 2.4569483322418306
  }, 
  {
    "count": 3, 
    "right": 2.5348996064958444, 
    "left": 2.4959239693688375
  }, 
  {
    "count": 2, 
    "right": 2.5738752436228514, 
    "left": 2.5348996064958444
  }, 
  {
    "count": 1, 
    "right": 2.6128508807498583, 
    "left": 2.5738752436228514
  }, 
  {
    "count": 1, 
    "right": 2.6518265178768652, 
    "left": 2.6128508807498583
  }, 
  {
    "count": 0, 
    "right": 2.6908021550038721, 
    "left": 2.6518265178768652
  }, 
  {
    "count": 3, 
    "right": 2.7297777921308795, 
    "left": 2.6908021550038721
  }, 
  {
    "count": 2, 
    "right": 2.7687534292578864, 
    "left": 2.7297777921308795
  }, 
  {
    "count": 0, 
    "right": 2.8077290663848933, 
    "left": 2.7687534292578864
  }, 
  {
    "count": 2, 
    "right": 2.8467047035119002, 
    "left": 2.8077290663848933
  }, 
  {
    "count": 0, 
    "right": 2.8856803406389071, 
    "left": 2.8467047035119002
  }, 
  {
    "count": 2, 
    "right": 2.924655977765914, 
    "left": 2.8856803406389071
  }, 
  {
    "count": 0, 
    "right": 2.9636316148929209, 
    "left": 2.924655977765914
  }, 
  {
    "count": 0, 
    "right": 3.0026072520199283, 
    "left": 2.9636316148929209
  }, 
  {
    "count": 1, 
    "right": 3.0415828891469352, 
    "left": 3.0026072520199283
  }, 
  {
    "count": 0, 
    "right": 3.0805585262739421, 
    "left": 3.0415828891469352
  }, 
  {
    "count": 0, 
    "right": 3.119534163400949, 
    "left": 3.0805585262739421
  }, 
  {
    "count": 0, 
    "right": 3.1585098005279559, 
    "left": 3.119534163400949
  }, 
  {
    "count": 0, 
    "right": 3.1974854376549628, 
    "left": 3.1585098005279559
  }, 
  {
    "count": 2, 
    "right": 3.2364610747819698, 
    "left": 3.1974854376549628
  }, 
  {
    "count": 0, 
    "right": 3.2754367119089771, 
    "left": 3.2364610747819698
  }, 
  {
    "count": 0, 
    "right": 3.314412349035984, 
    "left": 3.2754367119089771
  }, 
  {
    "count": 1, 
    "right": 3.3533879861629909, 
    "left": 3.314412349035984
  }, 
  {
    "count": 0, 
    "right": 3.3923636232899979, 
    "left": 3.3533879861629909
  }, 
  {
    "count": 0, 
    "right": 3.4313392604170048, 
    "left": 3.3923636232899979
  }, 
  {
    "count": 0, 
    "right": 3.4703148975440117, 
    "left": 3.4313392604170048
  }, 
  {
    "count": 0, 
    "right": 3.5092905346710186, 
    "left": 3.4703148975440117
  }, 
  {
    "count": 0, 
    "right": 3.5482661717980259, 
    "left": 3.5092905346710186
  }, 
  {
    "count": 0, 
    "right": 3.5872418089250329, 
    "left": 3.5482661717980259
  }, 
  {
    "count": 0, 
    "right": 3.6262174460520398, 
    "left": 3.5872418089250329
  }, 
  {
    "count": 0, 
    "right": 3.6651930831790467, 
    "left": 3.6262174460520398
  }, 
  {
    "count": 0, 
    "right": 3.7041687203060536, 
    "left": 3.6651930831790467
  }, 
  {
    "count": 1, 
    "right": 3.7431443574330605, 
    "left": 3.7041687203060536
  }, 
  {
    "count": 0, 
    "right": 3.7821199945600674, 
    "left": 3.7431443574330605
  }, 
  {
    "count": 0, 
    "right": 3.8210956316870748, 
    "left": 3.7821199945600674
  }, 
  {
    "count": 0, 
    "right": 3.8600712688140817, 
    "left": 3.8210956316870748
  }, 
  {
    "count": 0, 
    "right": 3.8990469059410886, 
    "left": 3.8600712688140817
  }, 
  {
    "count": 0, 
    "right": 3.9380225430680955, 
    "left": 3.8990469059410886
  }, 
  {
    "count": 0, 
    "right": 3.9769981801951024, 
    "left": 3.9380225430680955
  }, 
  {
    "count": 0, 
    "right": 4.0159738173221093, 
    "left": 3.9769981801951024
  }, 
  {
    "count": 0, 
    "right": 4.0549494544491163, 
    "left": 4.0159738173221093
  }, 
  {
    "count": 0, 
    "right": 4.0939250915761232, 
    "left": 4.0549494544491163
  }, 
  {
    "count": 0, 
    "right": 4.1329007287031301, 
    "left": 4.0939250915761232
  }, 
  {
    "count": 0, 
    "right": 4.171876365830137, 
    "left": 4.1329007287031301
  }, 
  {
    "count": 0, 
    "right": 4.2108520029571439, 
    "left": 4.171876365830137
  }, 
  {
    "count": 0, 
    "right": 4.2498276400841517, 
    "left": 4.2108520029571439
  }, 
  {
    "count": 1, 
    "right": 4.2888032772111586, 
    "left": 4.2498276400841517
  }, 
  {
    "count": 0, 
    "right": 4.3277789143381655, 
    "left": 4.2888032772111586
  }, 
  {
    "count": 0, 
    "right": 4.3667545514651724, 
    "left": 4.3277789143381655
  }, 
  {
    "count": 0, 
    "right": 4.4057301885921794, 
    "left": 4.3667545514651724
  }, 
  {
    "count": 0, 
    "right": 4.4447058257191863, 
    "left": 4.4057301885921794
  }, 
  {
    "count": 0, 
    "right": 4.4836814628461932, 
    "left": 4.4447058257191863
  }, 
  {
    "count": 0, 
    "right": 4.5226570999732001, 
    "left": 4.4836814628461932
  }, 
  {
    "count": 0, 
    "right": 4.561632737100207, 
    "left": 4.5226570999732001
  }, 
  {
    "count": 0, 
    "right": 4.6006083742272139, 
    "left": 4.561632737100207
  }, 
  {
    "count": 0, 
    "right": 4.6395840113542208, 
    "left": 4.6006083742272139
  }, 
  {
    "count": 0, 
    "right": 4.6785596484812277, 
    "left": 4.6395840113542208
  }, 
  {
    "count": 0, 
    "right": 4.7175352856082347, 
    "left": 4.6785596484812277
  }, 
  {
    "count": 0, 
    "right": 4.7565109227352416, 
    "left": 4.7175352856082347
  }, 
  {
    "count": 0, 
    "right": 4.7954865598622494, 
    "left": 4.7565109227352416
  }, 
  {
    "count": 0, 
    "right": 4.8344621969892563, 
    "left": 4.7954865598622494
  }, 
  {
    "count": 0, 
    "right": 4.8734378341162632, 
    "left": 4.8344621969892563
  }, 
  {
    "count": 0, 
    "right": 4.9124134712432701, 
    "left": 4.8734378341162632
  }, 
  {
    "count": 0, 
    "right": 4.951389108370277, 
    "left": 4.9124134712432701
  }, 
  {
    "count": 0, 
    "right": 4.9903647454972839, 
    "left": 4.951389108370277
  }, 
  {
    "count": 0, 
    "right": 5.0293403826242908, 
    "left": 4.9903647454972839
  }, 
  {
    "count": 0, 
    "right": 5.0683160197512978, 
    "left": 5.0293403826242908
  }, 
  {
    "count": 0, 
    "right": 5.1072916568783047, 
    "left": 5.0683160197512978
  }, 
  {
    "count": 0, 
    "right": 5.1462672940053116, 
    "left": 5.1072916568783047
  }, 
  {
    "count": 0, 
    "right": 5.1852429311323185, 
    "left": 5.1462672940053116
  }, 
  {
    "count": 0, 
    "right": 5.2242185682593254, 
    "left": 5.1852429311323185
  }, 
  {
    "count": 0, 
    "right": 5.2631942053863323, 
    "left": 5.2242185682593254
  }, 
  {
    "count": 0, 
    "right": 5.3021698425133392, 
    "left": 5.2631942053863323
  }, 
  {
    "count": 0, 
    "right": 5.3411454796403461, 
    "left": 5.3021698425133392
  }, 
  {
    "count": 0, 
    "right": 5.3801211167673539, 
    "left": 5.3411454796403461
  }, 
  {
    "count": 1, 
    "right": 5.4190967538943609, 
    "left": 5.3801211167673539
  }
];
export default DATA;
```
  </file>
  <file path="samples/chart/artist-repetition-lab/pages/src/main.js">
```javascript
import * as d3 from 'd3';
import DiscogWidget from './discog.js';
import artists from './starmap.js';
import hist from './histogram-data.js';
import * as common from './common.js';
const $=s=>document.querySelector(s),names=Object.keys(artists).sort();let widget;
window.showSong=s=>{ $('#song-detail').textContent=`${s.title} · ${Math.floor(s.yearf)} · ${common.rscore_to_readable(s.rscore)} size reduction`;d3.selectAll('.song').classed('selected',d=>d===s)};
window.renderSongList=ss=>{$('#song-list').replaceChildren(...ss.map(s=>{const b=document.createElement('button');b.textContent=`${s.title} · ${Math.floor(s.yearf)} · ${common.rscore_to_readable(s.rscore)}`;b.onclick=()=>{window.showSong(s);const el=[...document.querySelectorAll('.song')].find(e=>e.__data__===s);el?.scrollIntoView({block:'nearest',inline:'center'});el?.focus({preventScroll:true})};return b}))};
function options(){const found=names.filter(n=>n.toLowerCase().includes($('#search').value.toLowerCase()));$('#artist').replaceChildren(...found.map(n=>new Option(n,n)));$('#artist').disabled=!found.length;if(found.includes(widget?.artist))$('#artist').value=widget.artist;$('#matches').textContent=`${found.length} / ${names.length} artists`}
function select(name){$('#search').value='';options();return widget.updateArtist(name)}
$('#search').placeholder=`Search ${names.length} artists…`;options();$('#artist').value='Gwen Stefani';widget=DiscogWidget.init();window.discography={widget,artists,hist,common,select};
$('#search').oninput=options;$('#artist').onchange=()=>widget.updateArtist($('#artist').value);$('#random').onclick=()=>{let n=names[Math.floor(Math.random()*names.length)];if(n===widget.artist)n=names[(names.indexOf(n)+1)%names.length];select(n)};$('#reset').onclick=()=>select('Gwen Stefani');$('#examples').onclick=e=>{if(e.target.tagName==='BUTTON')select(e.target.textContent)};
let timer;addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(()=>{const name=widget.artist;widget.forcesim?.stop();widget.request++;$('#discog-widget').replaceChildren();widget=DiscogWidget.init();window.discography.widget=widget;select(name)},180)});
```
  </file>
  <file path="samples/chart/artist-repetition-lab/pages/src/starmap.js">
```javascript
var DATA = {
  "Michael Bolton": "michael_bolton_discog.json", 
  "Commodores": "commodores_discog.json", 
  "Beyonce": "beyonce_discog.json", 
  "Avicii": "avicii_discog.json", 
  "The Weeknd": "the_weeknd_discog.json", 
  "New Edition": "new_edition_discog.json", 
  "Reba McEntire": "reba_mcentire_discog.json", 
  "Sam Cooke": "sam_cooke_discog.json", 
  "James Blunt": "james_blunt_discog.json", 
  "Eminem": "eminem_discog.json", 
  "Rodney Atkins": "rodney_atkins_discog.json", 
  "Darius Rucker": "darius_rucker_discog.json", 
  "Daughtry": "daughtry_discog.json", 
  "Toto": "toto_discog.json", 
  "Three Days Grace": "three_days_grace_discog.json", 
  "The Beatles": "the_beatles_discog.json", 
  "Al Green": "al_green_discog.json", 
  "Don Henley": "don_henley_discog.json", 
  "Glenn Frey": "glenn_frey_discog.json", 
  "Rob Thomas": "rob_thomas_discog.json", 
  "Paramore": "paramore_discog.json", 
  "Guns N  Roses": "guns_n__roses_discog.json", 
  "Gary Allan": "gary_allan_discog.json", 
  "Kenny Chesney": "kenny_chesney_discog.json", 
  "John Waite": "john_waite_discog.json", 
  "Lana Del Rey": "lana_del_rey_discog.json", 
  "Trisha Yearwood": "trisha_yearwood_discog.json", 
  "Busta Rhymes": "busta_rhymes_discog.json", 
  "Boyz II Men": "boyz_ii_men_discog.json", 
  "John Mellencamp": "john_mellencamp_discog.json", 
  "50 Cent": "50_cent_discog.json", 
  "Red Hot Chili Peppers": "red_hot_chili_peppers_discog.json", 
  "Paula Abdul": "paula_abdul_discog.json", 
  "Roy Orbison": "roy_orbison_discog.json", 
  "Simple Plan": "simple_plan_discog.json", 
  "5 Seconds Of Summer": "5_seconds_of_summer_discog.json", 
  "Janet": "janet_discog.json", 
  "Train": "train_discog.json", 
  "The Cure": "the_cure_discog.json", 
  "The Alan Parsons Project": "the_alan_parsons_project_discog.json", 
  "Daryl Hall  John Oates": "daryl_hall__john_oates_discog.json", 
  "America": "america_discog.json", 
  "Metallica": "metallica_discog.json", 
  "Roxette": "roxette_discog.json", 
  "Pet Shop Boys": "pet_shop_boys_discog.json", 
  "Thomas Rhett": "thomas_rhett_discog.json", 
  "Meghan Trainor": "meghan_trainor_discog.json", 
  "Wilson Pickett": "wilson_pickett_discog.json", 
  "Disturbed": "disturbed_discog.json", 
  "Pitbull": "pitbull_discog.json", 
  "Michael Jackson": "michael_jackson_discog.json", 
  "Nat King Cole": "nat_king_cole_discog.json", 
  "Jerry Butler": "jerry_butler_discog.json", 
  "Queen": "queen_discog.json", 
  "B.B. King": "b.b._king_discog.json", 
  "Sara Evans": "sara_evans_discog.json", 
  "The Band Perry": "the_band_perry_discog.json", 
  "John Michael Montgomery": "john_michael_montgomery_discog.json", 
  "Ciara": "ciara_discog.json", 
  "Culture Club": "culture_club_discog.json", 
  "UB40": "ub40_discog.json", 
  "Sawyer Fredericks": "sawyer_fredericks_discog.json", 
  "Glen Campbell": "glen_campbell_discog.json", 
  "Kellie Pickler": "kellie_pickler_discog.json", 
  "Randy Houser": "randy_houser_discog.json", 
  "Annie Lennox": "annie_lennox_discog.json", 
  "Diana Ross": "diana_ross_discog.json", 
  "Drake & Future": "drake_&_future_discog.json", 
  "Justin Timberlake": "justin_timberlake_discog.json", 
  "Sam Hunt": "sam_hunt_discog.json", 
  "Whitney Houston": "whitney_houston_discog.json", 
  "Ricky Martin": "ricky_martin_discog.json", 
  "Akon": "akon_discog.json", 
  "Lee Brice": "lee_brice_discog.json", 
  "M.C. Hammer": "m.c._hammer_discog.json", 
  "Little Big Town": "little_big_town_discog.json", 
  "Connie Francis": "connie_francis_discog.json", 
  "Jackson 5": "jackson_5_discog.json", 
  "Craig Morgan": "craig_morgan_discog.json", 
  "Shania Twain": "shania_twain_discog.json", 
  "Foo Fighters": "foo_fighters_discog.json", 
  "Marvin Gaye": "marvin_gaye_discog.json", 
  "The Doobie Brothers": "the_doobie_brothers_discog.json", 
  "Ludacris": "ludacris_discog.json", 
  "Kim Carnes": "kim_carnes_discog.json", 
  "Carly Simon": "carly_simon_discog.json", 
  "Kris Allen": "kris_allen_discog.json", 
  "N Sync": "n_sync_discog.json", 
  "Bad Company": "bad_company_discog.json", 
  "Bob Seger": "bob_seger_discog.json", 
  "Sugarland": "sugarland_discog.json", 
  "The Police": "the_police_discog.json", 
  "Coldplay": "coldplay_discog.json", 
  "Lee Ann Womack": "lee_ann_womack_discog.json", 
  "Luke Bryan": "luke_bryan_discog.json", 
  "Taylor Swift": "taylor_swift_discog.json", 
  "Keith Urban": "keith_urban_discog.json", 
  "Aaliyah": "aaliyah_discog.json", 
  "Mac Miller": "mac_miller_discog.json", 
  "Etta James": "etta_james_discog.json", 
  "Nelly Furtado": "nelly_furtado_discog.json", 
  "Johnny Mathis": "johnny_mathis_discog.json", 
  "Avant": "avant_discog.json", 
  "Jake Owen": "jake_owen_discog.json", 
  "Dusty Springfield": "dusty_springfield_discog.json", 
  "James Brown": "james_brown_discog.json", 
  "Maxwell": "maxwell_discog.json", 
  "One Direction": "one_direction_discog.json", 
  "Seal": "seal_discog.json", 
  "Selena Gomez": "selena_gomez_discog.json", 
  "Michelle Branch": "michelle_branch_discog.json", 
  "The Black Eyed Peas": "the_black_eyed_peas_discog.json", 
  "Dionne Warwick": "dionne_warwick_discog.json", 
  "Ariana Grande": "ariana_grande_discog.json", 
  "Tim McGraw": "tim_mcgraw_discog.json", 
  "Jon Secada": "jon_secada_discog.json", 
  "Brantley Gilbert": "brantley_gilbert_discog.json", 
  "Rihanna": "rihanna_discog.json", 
  "Elvis Presley": "elvis_presley_discog.json", 
  "The Offspring": "the_offspring_discog.json", 
  "Brett Eldredge": "brett_eldredge_discog.json", 
  "Night Ranger": "night_ranger_discog.json", 
  "INXS": "inxs_discog.json", 
  "The Impressions": "the_impressions_discog.json", 
  "Sade": "sade_discog.json", 
  "Depeche Mode": "depeche_mode_discog.json", 
  "Beck": "beck_discog.json", 
  "Green Day": "green_day_discog.json", 
  "Bette Midler": "bette_midler_discog.json", 
  "Electric Light Orchestra": "electric_light_orchestra_discog.json", 
  "Kings Of Leon": "kings_of_leon_discog.json", 
  "Breaking Benjamin": "breaking_benjamin_discog.json", 
  "Barbra Streisand": "barbra_streisand_discog.json", 
  "Bob Dylan": "bob_dylan_discog.json", 
  "The Everly Brothers": "the_everly_brothers_discog.json", 
  "Janet Jackson": "janet_jackson_discog.json", 
  "Eli Young Band": "eli_young_band_discog.json", 
  "Tina Turner": "tina_turner_discog.json", 
  "The Dave Clark Five": "the_dave_clark_five_discog.json", 
  "Avril Lavigne": "avril_lavigne_discog.json", 
  "Dru Hill": "dru_hill_discog.json", 
  "Eric Church": "eric_church_discog.json", 
  "Four Tops": "four_tops_discog.json", 
  "Sting": "sting_discog.json", 
  "The Fray": "the_fray_discog.json", 
  "Andy Grammer": "andy_grammer_discog.json", 
  "Easton Corbin": "easton_corbin_discog.json", 
  "Shakira": "shakira_discog.json", 
  "Lifehouse": "lifehouse_discog.json", 
  "Glee Cast": "glee_cast_discog.json", 
  "Panic! At The Disco": "panic!_at_the_disco_discog.json", 
  "Jim Reeves": "jim_reeves_discog.json", 
  "Bobby Darin": "bobby_darin_discog.json", 
  "Anita Baker": "anita_baker_discog.json", 
  "Nelly": "nelly_discog.json", 
  "Journey": "journey_discog.json", 
  "Joe": "joe_discog.json", 
  "Hannah Montana": "hannah_montana_discog.json", 
  "Hilary Duff": "hilary_duff_discog.json", 
  "Johnny Cash": "johnny_cash_discog.json", 
  "The Moody Blues": "the_moody_blues_discog.json", 
  "Ellie Goulding": "ellie_goulding_discog.json", 
  "Howard Jones": "howard_jones_discog.json", 
  "Jerrod Niemann": "jerrod_niemann_discog.json", 
  "Miguel": "miguel_discog.json", 
  "The Smashing Pumpkins": "the_smashing_pumpkins_discog.json", 
  "George Strait": "george_strait_discog.json", 
  "Enrique Iglesias": "enrique_iglesias_discog.json", 
  "R.E.M.": "r.e.m._discog.json", 
  "Gwen Stefani": "gwen_stefani_discog.json", 
  "Marty Robbins": "marty_robbins_discog.json", 
  "Xscape": "xscape_discog.json", 
  "David Cook": "david_cook_discog.json", 
  "Toni Braxton": "toni_braxton_discog.json", 
  "Weird Al Yankovic": "weird_al_yankovic_discog.json", 
  "Santana": "santana_discog.json", 
  "Sarah McLachlan": "sarah_mclachlan_discog.json", 
  "Warrant": "warrant_discog.json", 
  "Genesis": "genesis_discog.json", 
  "John Denver": "john_denver_discog.json", 
  "Aretha Franklin": "aretha_franklin_discog.json", 
  "Pretenders": "pretenders_discog.json", 
  "Andy Williams": "andy_williams_discog.json", 
  "Chris Cagle": "chris_cagle_discog.json", 
  "The Killers": "the_killers_discog.json", 
  "Elton John": "elton_john_discog.json", 
  "Petula Clark": "petula_clark_discog.json", 
  "Alan Jackson": "alan_jackson_discog.json", 
  "Big & Rich": "big_&_rich_discog.json", 
  "David Bowie": "david_bowie_discog.json", 
  "Fetty Wap": "fetty_wap_discog.json", 
  "Tracy Byrd": "tracy_byrd_discog.json", 
  "TLC": "tlc_discog.json", 
  "Linda Ronstadt": "linda_ronstadt_discog.json", 
  "Jagged Edge": "jagged_edge_discog.json", 
  "Florida Georgia Line": "florida_georgia_line_discog.json", 
  "Zac Brown Band": "zac_brown_band_discog.json", 
  "Bobby Vinton": "bobby_vinton_discog.json", 
  "Kanye West": "kanye_west_discog.json", 
  "J. Cole": "j._cole_discog.json", 
  "Eddie Money": "eddie_money_discog.json", 
  "The Temptations": "the_temptations_discog.json", 
  "Perry Como": "perry_como_discog.json", 
  "Adele": "adele_discog.json", 
  "The 5th Dimension": "the_5th_dimension_discog.json", 
  "George Michael": "george_michael_discog.json", 
  "twenty one pilots": "twenty_one_pilots_discog.json", 
  "Madonna": "madonna_discog.json", 
  "James Brown And The Famous Flames": "james_brown_and_the_famous_flames_discog.json", 
  "Lesley Gore": "lesley_gore_discog.json", 
  "Loverboy": "loverboy_discog.json", 
  "Stevie Nicks": "stevie_nicks_discog.json", 
  "Chicago": "chicago_discog.json", 
  "Britney Spears": "britney_spears_discog.json", 
  "Cyndi Lauper": "cyndi_lauper_discog.json", 
  "Alice Cooper": "alice_cooper_discog.json", 
  "Keyshia Cole": "keyshia_cole_discog.json", 
  "Gladys Knight And The Pips": "gladys_knight_and_the_pips_discog.json", 
  "Imagine Dragons": "imagine_dragons_discog.json", 
  "Terri Clark": "terri_clark_discog.json", 
  "Natalie Cole": "natalie_cole_discog.json", 
  "Drake Featuring Lil Wayne": "drake_featuring_lil_wayne_discog.json", 
  "The Isley Brothers": "the_isley_brothers_discog.json", 
  "Kiss": "kiss_discog.json", 
  "Johnny Tillotson": "johnny_tillotson_discog.json", 
  "Shawn Mendes": "shawn_mendes_discog.json", 
  "Anne Murray": "anne_murray_discog.json", 
  "Andy Griggs": "andy_griggs_discog.json", 
  "Seether": "seether_discog.json", 
  "Melissa Etheridge": "melissa_etheridge_discog.json", 
  "Olivia Newton-John": "olivia_newton-john_discog.json", 
  "Tyrese": "tyrese_discog.json", 
  "Brad Paisley": "brad_paisley_discog.json", 
  "Ashanti": "ashanti_discog.json", 
  "Big Sean": "big_sean_discog.json", 
  "Bon Jovi": "bon_jovi_discog.json", 
  "Adam Lambert": "adam_lambert_discog.json", 
  "Nicki Minaj": "nicki_minaj_discog.json", 
  "Kelly Clarkson": "kelly_clarkson_discog.json", 
  "Flo Rida": "flo_rida_discog.json", 
  "Jordan Smith": "jordan_smith_discog.json", 
  "Ke$ha": "ke$ha_discog.json", 
  "Phil Collins": "phil_collins_discog.json", 
  "Young Thug": "young_thug_discog.json", 
  "Jesse McCartney": "jesse_mccartney_discog.json", 
  "Cole Swindell": "cole_swindell_discog.json", 
  "10,000 Maniacs": "10,000_maniacs_discog.json", 
  "Backstreet Boys": "backstreet_boys_discog.json", 
  "Dustin Lynch": "dustin_lynch_discog.json", 
  "Fall Out Boy": "fall_out_boy_discog.json", 
  "OutKast": "outkast_discog.json", 
  "Rod Stewart": "rod_stewart_discog.json", 
  "Fats Domino": "fats_domino_discog.json", 
  "Fergie": "fergie_discog.json", 
  "Kenny Rogers": "kenny_rogers_discog.json", 
  "Justin Moore": "justin_moore_discog.json", 
  "The Beach Boys": "the_beach_boys_discog.json", 
  "ZZ Top": "zz_top_discog.json", 
  "Jody Watley": "jody_watley_discog.json", 
  "Color Me Badd": "color_me_badd_discog.json", 
  "Colbie Caillat": "colbie_caillat_discog.json", 
  "Stevie B": "stevie_b_discog.json", 
  "Pat Benatar": "pat_benatar_discog.json", 
  "Miranda Lambert": "miranda_lambert_discog.json", 
  "Juice Newton": "juice_newton_discog.json", 
  "Katy Perry": "katy_perry_discog.json", 
  "Jo Dee Messina": "jo_dee_messina_discog.json", 
  "Laura Branigan": "laura_branigan_discog.json", 
  "Sheryl Crow": "sheryl_crow_discog.json", 
  "Rick Springfield": "rick_springfield_discog.json", 
  "Neil Diamond": "neil_diamond_discog.json", 
  "Dolly Parton": "dolly_parton_discog.json", 
  "My Chemical Romance": "my_chemical_romance_discog.json", 
  "Aerosmith": "aerosmith_discog.json", 
  "Usher": "usher_discog.json", 
  "Motley Crue": "motley_crue_discog.json", 
  "Faith Hill": "faith_hill_discog.json", 
  "3OH!3": "3oh!3_discog.json", 
  "System Of A Down": "system_of_a_down_discog.json", 
  "Christina Aguilera": "christina_aguilera_discog.json", 
  "T.I.": "t.i._discog.json", 
  "Jefferson Starship": "jefferson_starship_discog.json", 
  "R. Kelly": "r._kelly_discog.json", 
  "En Vogue": "en_vogue_discog.json", 
  "Ne-Yo": "ne-yo_discog.json", 
  "Puddle Of Mudd": "puddle_of_mudd_discog.json", 
  "Jason Derulo": "jason_derulo_discog.json", 
  "Wiz Khalifa": "wiz_khalifa_discog.json", 
  "John Mayer": "john_mayer_discog.json", 
  "Yes": "yes_discog.json", 
  "Bee Gees": "bee_gees_discog.json", 
  "Billy Joel": "billy_joel_discog.json", 
  "Luther Vandross": "luther_vandross_discog.json", 
  "Bruce Springsteen": "bruce_springsteen_discog.json", 
  "Robert Palmer": "robert_palmer_discog.json", 
  "Earth, Wind & Fire": "earth,_wind_&_fire_discog.json", 
  "Billy Currington": "billy_currington_discog.json", 
  "Kendrick Lamar": "kendrick_lamar_discog.json", 
  "Nancy Sinatra": "nancy_sinatra_discog.json", 
  "The Hollies": "the_hollies_discog.json", 
  "Ray Charles": "ray_charles_discog.json", 
  "The Monkees": "the_monkees_discog.json", 
  "Babyface": "babyface_discog.json", 
  "The Guess Who": "the_guess_who_discog.json", 
  "Neil Sedaka": "neil_sedaka_discog.json", 
  "Three Dog Night": "three_dog_night_discog.json", 
  "Barry Manilow": "barry_manilow_discog.json", 
  "Dave Matthews Band": "dave_matthews_band_discog.json", 
  "Donovan": "donovan_discog.json", 
  "Frank Ocean": "frank_ocean_discog.json", 
  "Dierks Bentley": "dierks_bentley_discog.json", 
  "The Pointer Sisters": "the_pointer_sisters_discog.json", 
  "Mariah Carey": "mariah_carey_discog.json", 
  "Rae Sremmurd": "rae_sremmurd_discog.json", 
  "Steve Winwood": "steve_winwood_discog.json", 
  "Incubus": "incubus_discog.json", 
  "Eurythmics": "eurythmics_discog.json", 
  "Van Halen": "van_halen_discog.json", 
  "Maroon5": "maroon5_discog.json", 
  "Frank Sinatra": "frank_sinatra_discog.json", 
  "Nas": "nas_discog.json", 
  "Celine Dion": "celine_dion_discog.json", 
  "Jonas Brothers": "jonas_brothers_discog.json", 
  "Survivor": "survivor_discog.json", 
  "Darryl Worley": "darryl_worley_discog.json", 
  "Brenda Lee": "brenda_lee_discog.json", 
  "Demi Lovato": "demi_lovato_discog.json", 
  "Spice Girls": "spice_girls_discog.json", 
  "Miley Cyrus": "miley_cyrus_discog.json", 
  "Dixie Chicks": "dixie_chicks_discog.json", 
  "LeAnn Rimes": "leann_rimes_discog.json", 
  "Goo Goo Dolls": "goo_goo_dolls_discog.json", 
  "Jennifer Lopez": "jennifer_lopez_discog.json", 
  "Paul Anka": "paul_anka_discog.json", 
  "Josh Turner": "josh_turner_discog.json", 
  "Linkin Park": "linkin_park_discog.json", 
  "Drake": "drake_discog.json", 
  "Dean Martin": "dean_martin_discog.json", 
  "Thompson Square": "thompson_square_discog.json", 
  "Leona Lewis": "leona_lewis_discog.json", 
  "Selena Gomez & The Scene": "selena_gomez_&_the_scene_discog.json", 
  "The Kinks": "the_kinks_discog.json", 
  "Collective Soul": "collective_soul_discog.json", 
  "Michael Buble": "michael_buble_discog.json", 
  "Jason Aldean": "jason_aldean_discog.json", 
  "Kylie Minogue": "kylie_minogue_discog.json", 
  "Bruno Mars": "bruno_mars_discog.json", 
  "Jordin Sparks": "jordin_sparks_discog.json", 
  "Toby Keith": "toby_keith_discog.json", 
  "Mary J. Blige": "mary_j._blige_discog.json", 
  "Pink": "pink_discog.json", 
  "Richard Marx": "richard_marx_discog.json", 
  "Jack Johnson": "jack_johnson_discog.json", 
  "Alicia Keys": "alicia_keys_discog.json", 
  "Gavin DeGraw": "gavin_degraw_discog.json", 
  "Paul McCartney": "paul_mccartney_discog.json", 
  "Ginuwine": "ginuwine_discog.json", 
  "Destiny's Child": "destinys_child_discog.json", 
  "Brandy": "brandy_discog.json", 
  "REO Speedwagon": "reo_speedwagon_discog.json", 
  "Sean Paul": "sean_paul_discog.json", 
  "Lady Antebellum": "lady_antebellum_discog.json", 
  "Chris Brown": "chris_brown_discog.json", 
  "Otis Redding": "otis_redding_discog.json", 
  "Danielle Bradbery": "danielle_bradbery_discog.json", 
  "Lionel Richie": "lionel_richie_discog.json", 
  "Chris Young": "chris_young_discog.json", 
  "98 Degrees": "98_degrees_discog.json", 
  "Papa Roach": "papa_roach_discog.json", 
  "The Supremes": "the_supremes_discog.json", 
  "Heart": "heart_discog.json", 
  "Jessica Simpson": "jessica_simpson_discog.json", 
  "The Rolling Stones": "the_rolling_stones_discog.json", 
  "Creed": "creed_discog.json", 
  "Gino Vannelli": "gino_vannelli_discog.json", 
  "Lorde": "lorde_discog.json", 
  "The Byrds": "the_byrds_discog.json", 
  "Prince": "prince_discog.json", 
  "Staind": "staind_discog.json", 
  "Lil Wayne": "lil_wayne_discog.json", 
  "Trey Songz": "trey_songz_discog.json", 
  "Gloria Estefan": "gloria_estefan_discog.json", 
  "Amy Grant": "amy_grant_discog.json", 
  "Hunter Hayes": "hunter_hayes_discog.json", 
  "U2": "u2_discog.json", 
  "Shinedown": "shinedown_discog.json", 
  "Joe Nichols": "joe_nichols_discog.json", 
  "Cassadee Pope": "cassadee_pope_discog.json", 
  "Bryan Adams": "bryan_adams_discog.json", 
  "Bonnie Raitt": "bonnie_raitt_discog.json", 
  "Phil Vassar": "phil_vassar_discog.json", 
  "matchbox twenty": "matchbox_twenty_discog.json", 
  "Thompson Twins": "thompson_twins_discog.json", 
  "Rascal Flatts": "rascal_flatts_discog.json", 
  "No Doubt": "no_doubt_discog.json", 
  "OneRepublic": "onerepublic_discog.json", 
  "Robin Thicke": "robin_thicke_discog.json", 
  "Duran Duran": "duran_duran_discog.json", 
  "Jewel": "jewel_discog.json", 
  "Air Supply": "air_supply_discog.json", 
  "Ed Sheeran": "ed_sheeran_discog.json", 
  "Tom Jones": "tom_jones_discog.json", 
  "Migos": "migos_discog.json", 
  "Sam Smith": "sam_smith_discog.json", 
  "Maroon 5": "maroon_5_discog.json", 
  "Trace Adkins": "trace_adkins_discog.json", 
  "Lonestar": "lonestar_discog.json", 
  "Lenny Kravitz": "lenny_kravitz_discog.json", 
  "The Who": "the_who_discog.json", 
  "Jodeci": "jodeci_discog.json", 
  "Kenny Loggins": "kenny_loggins_discog.json", 
  "Billy Ocean": "billy_ocean_discog.json", 
  "Poison": "poison_discog.json", 
  "Montgomery Gentry": "montgomery_gentry_discog.json", 
  "Billy Squier": "billy_squier_discog.json", 
  "Dr. Hook": "dr._hook_discog.json", 
  "Ace Of Base": "ace_of_base_discog.json", 
  "2Pac": "2pac_discog.json", 
  "3 Doors Down": "3_doors_down_discog.json", 
  "Foreigner": "foreigner_discog.json", 
  "Dan Fogelberg": "dan_fogelberg_discog.json", 
  "Chuck Berry": "chuck_berry_discog.json", 
  "The O'Jays": "the_ojays_discog.json", 
  "Cher": "cher_discog.json", 
  "Fantasia": "fantasia_discog.json", 
  "CeCe Peniston": "cece_peniston_discog.json", 
  "Stevie Wonder": "stevie_wonder_discog.json", 
  "The Drifters": "the_drifters_discog.json", 
  "Martina McBride": "martina_mcbride_discog.json", 
  "The Cars": "the_cars_discog.json", 
  "Joe Diffie": "joe_diffie_discog.json", 
  "Pearl Jam": "pearl_jam_discog.json", 
  "Natasha Bedingfield": "natasha_bedingfield_discog.json", 
  "Bruce Hornsby": "bruce_hornsby_discog.json", 
  "Vanessa Williams": "vanessa_williams_discog.json", 
  "Steely Dan": "steely_dan_discog.json", 
  "Donna Summer": "donna_summer_discog.json", 
  "Clay Walker": "clay_walker_discog.json", 
  "Monica": "monica_discog.json", 
  "Sheena Easton": "sheena_easton_discog.json", 
  "Herman's Hermits": "hermans_hermits_discog.json", 
  "Blake Shelton": "blake_shelton_discog.json", 
  "Mario": "mario_discog.json", 
  "Justin Bieber": "justin_bieber_discog.json", 
  "Nine Inch Nails": "nine_inch_nails_discog.json", 
  "Fleetwood Mac": "fleetwood_mac_discog.json", 
  "P!nk": "p!nk_discog.json", 
  "Sean Kingston": "sean_kingston_discog.json", 
  "ABBA": "abba_discog.json", 
  "Lady Gaga": "lady_gaga_discog.json", 
  "Nickelback": "nickelback_discog.json", 
  "Future": "future_discog.json", 
  "Meek Mill": "meek_mill_discog.json", 
  "Def Leppard": "def_leppard_discog.json", 
  "Musiq Soulchild": "musiq_soulchild_discog.json", 
  "Barenaked Ladies": "barenaked_ladies_discog.json", 
  "Audioslave": "audioslave_discog.json", 
  "Carrie Underwood": "carrie_underwood_discog.json", 
  "Styx": "styx_discog.json", 
  "Tears For Fears": "tears_for_fears_discog.json", 
  "Jay-Z": "jay-z_discog.json"
};
export default DATA;
```
  </file>
  <file path="samples/chart/artist-repetition-lab/pages/style.css">
```css
@font-face{font-family:Atlas;src:url('assets/fonts/AtlasGrotesk-Regular-Web.woff2');font-weight:400}@font-face{font-family:Atlas;src:url('assets/fonts/AtlasGrotesk-Medium-Web.woff2');font-weight:500}@font-face{font-family:Canela;src:url('assets/fonts/Canela-Light-Web.woff2')}@font-face{font-family:Publico;src:url('assets/fonts/PublicoText-Roman-Web.woff2')}*{box-sizing:border-box}body{margin:0;color:#232323;background:#fff;font-family:Atlas,Arial,sans-serif}main{max-width:1440px;margin:auto;padding:28px 40px}header{display:flex;justify-content:space-between;font-size:11px;border-bottom:1px solid #ccc;padding-bottom:22px;gap:20px}a{color:inherit;text-underline-offset:4px}.intro{display:grid;grid-template-columns:1fr 1fr;column-gap:80px;padding:35px 0 24px}.eyebrow{font-size:11px;letter-spacing:1px;grid-column:1/-1;margin:0 0 20px}.intro h1{font-family:Canela,Georgia,serif;font-weight:400;font-size:54px;line-height:1.04;letter-spacing:-1px;margin:0;grid-row:2/4}.intro>p:not(.eyebrow){font-family:Publico,Georgia,serif;font-size:17px;line-height:1.6;margin:0}.intro .credit{font-family:Atlas!important;font-size:11px!important;margin-top:14px!important}.toolbar{display:flex;gap:16px;align-items:end;flex-wrap:wrap;padding:22px 0 16px;border-top:1px solid #ddd}.toolbar label{display:grid;gap:8px;font-size:11px;text-transform:uppercase;letter-spacing:.6px}input,select,button{font:inherit;background:white;border:1px solid #aaa;color:#232323;border-radius:3px;padding:10px 12px}input,select{width:250px;font-size:14px}button{cursor:pointer;font-size:12px}button:hover{background:#f0f0f0}button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible,.chart-scroll:focus-visible,summary:focus-visible{outline:3px solid #21918c;outline-offset:3px}#matches{font-size:11px;margin-bottom:12px}nav{display:flex;gap:8px;flex-wrap:wrap}nav button{border:0;padding:4px 8px;text-decoration:underline;text-underline-offset:4px;color:#555}.chart-heading{display:flex;justify-content:space-between;gap:16px;margin-top:20px;font-size:12px}.mobile-hint{display:none}.chart-scroll{max-width:100%;overflow-x:auto;overflow-y:hidden}#discog-widget{min-width:1000px}#discog-widget h1{display:none}#discog-widget h1+div{display:none}svg{display:block;overflow:hidden}svg.beeswarm .baseline text{font-family:Atlas;pointer-events:none;font-weight:500;letter-spacing:.02rem;text-transform:capitalize}.bubble-container{font-size:.7rem}.bubble-container text,.bubble-container tspan{fill:#fff;paint-order:stroke;stroke-width:3px;stroke-linejoin:round;text-anchor:middle;font-weight:500;letter-spacing:.1em;pointer-events:none}.bubble-container circle{cursor:pointer}.bubble-container:focus{outline:none}.bubble-container:focus circle,.bubble-container.selected circle{stroke:#151515;stroke-width:3px}.axis text{text-anchor:middle;font-family:Atlas;font-size:10px}.axis .label{font-size:.75rem;font-weight:500;text-transform:uppercase;fill:#232323}#song-detail{font-family:Publico,Georgia,serif;min-height:68px;font-size:18px;line-height:1.6;padding:16px 0;border-top:1px solid #bbb;border-bottom:1px solid #bbb}details{margin:22px 0}summary{cursor:pointer;font-size:13px}#song-list{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:16px}#song-list button{text-align:left;line-height:1.5}footer{max-width:800px;font-size:12px;line-height:1.7;color:#666;margin:30px 0}@media(max-width:1000px){main{padding:20px}.intro{column-gap:28px}.intro h1{font-size:40px}.mobile-hint{display:block;max-width:260px;color:#666}#song-list{grid-template-columns:repeat(2,1fr)}}@media(max-width:600px){header{font-size:9px}.intro{display:block;padding-top:28px}.intro h1{font-size:43px;margin-bottom:20px}.intro .eyebrow{margin-bottom:14px}.intro>p:not(.eyebrow){font-size:15px}.toolbar{gap:12px}.toolbar label{width:100%}input,select{width:100%}.chart-heading{display:block}.mobile-hint{max-width:none}#song-list{grid-template-columns:1fr}#song-detail{font-size:16px}}
```
  </file>
  <omitted path="../../../../../index.html">Navigation back to the formal sample gallery.</omitted>
  <omitted path="SAMPLE.md">Local source attribution and approval record; not part of the rendering algorithm.</omitted>
  <omitted path="app.js">Locally shipped runtime build or library dependency; readable author components and styles are included in this bundle.</omitted>
</sample>
