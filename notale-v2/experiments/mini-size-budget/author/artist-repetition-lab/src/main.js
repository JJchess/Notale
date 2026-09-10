const d3=window.d3;
import DiscogWidget from './discog.js';
import artists from './starmap.js';
import hist from './histogram-data.js';
import * as common from './common.js';
const $=s=>document.querySelector(s),names=Object.keys(artists).sort();let widget;
window.showSong=s=>{ $('#song-detail').textContent=`${s.title} · ${Math.floor(s.yearf)} · ${common.rscore_to_readable(s.rscore)} size reduction`;d3.selectAll('.song').classed('selected',d=>d===s)};
window.renderSongList=ss=>{$('details').scrollTop=0;$('#song-list').replaceChildren(...ss.map(s=>{const b=document.createElement('button');b.textContent=`${s.title} · ${Math.floor(s.yearf)} · ${common.rscore_to_readable(s.rscore)}`;b.onclick=()=>{window.showSong(s);const el=[...document.querySelectorAll('.song')].find(e=>e.__data__===s);el?.scrollIntoView({block:'nearest',inline:'center'});el?.focus({preventScroll:true})};return b}))};
function options(){const found=names.filter(n=>n.toLowerCase().includes($('#search').value.toLowerCase()));$('#artist').replaceChildren(...found.map(n=>new Option(n,n)));$('#artist').disabled=!found.length;if(found.includes(widget?.artist))$('#artist').value=widget.artist;$('#matches').textContent=`${found.length} / ${names.length} artists`}
function select(name){$('#search').value='';options();return widget.updateArtist(name)}
$('#search').placeholder=`Search ${names.length} artists…`;options();$('#artist').value='Gwen Stefani';widget=DiscogWidget.init();window.discography={widget,artists,hist,common,select};
$('#search').oninput=options;$('#artist').onchange=()=>widget.updateArtist($('#artist').value);$('#random').onclick=()=>{let n=names[Math.floor(Math.random()*names.length)];if(n===widget.artist)n=names[(names.indexOf(n)+1)%names.length];select(n)};$('#reset').onclick=()=>select('Gwen Stefani');$('#examples').onclick=e=>{if(e.target.tagName==='BUTTON')select(e.target.textContent)};
let timer;function resize(){clearTimeout(timer);timer=setTimeout(()=>{const name=widget.artist;widget.forcesim?.stop();widget.request++;$('#discog-widget').replaceChildren();widget=DiscogWidget.init();window.discography.widget=widget;select(name)},180)}
addEventListener('resize',resize);
addEventListener('pagehide',()=>{removeEventListener('resize',resize);clearTimeout(timer);widget.request++;widget.forcesim?.stop();widget.root.selectAll('*').interrupt();},{once:true});
