/** Widget for showing repetitiveness of an individual artist's discography
 */
import * as d3 from 'd3';




import * as comm from './common.js';
import { BeeswarmChart } from './basechart.js';

import ARTIST_LOOKUP from './starmap.js';
import HIST from './histogram-data.js';





const DEFAULT_ARTIST = 'Gwen Stefani';

// If an artist has at least this many songs, grow the height to accomodate all the
// circles.
const BIG_DISCOGRAPHY = 40;
// How much to multiply the base height by when expanding to accomodate a big discography.
const GROWTH_FACTOR = 1.3;

// Default limits for the rscore axis
const RLIM = [comm.pctiles[10], comm.pctiles[90]];
//const RLIM = [comm.pctiles[1], comm.pctiles[99]];

class DiscogWidget extends BeeswarmChart {

  // TODO: a general pattern worth trying: use setters to handle the rerendering
  // associated with certain state changes (setting beehive, setting artist, etc.)
  constructor() {
    let rootsel = '#discog-widget';
    super(rootsel);
    this.originalHeight = this.totalH;
    
    // Whether we've grown this figure's height to accomodate a big discography.
    this.expanded = false;
    this.setupAxes();
    this.updateArtist(DEFAULT_ARTIST);
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
    this.updateAxis();

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

  // The page controller owns artist selection and randomization.
  updateArtist(artist) {
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
      .on('mouseover', song => window.showSong(song))
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

  static init() {
    let disco = new DiscogWidget();
    return disco;
  }
}

export default DiscogWidget;
