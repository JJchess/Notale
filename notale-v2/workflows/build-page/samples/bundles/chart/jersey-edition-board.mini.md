<sample id="jersey-edition-board" category="chart" variant="mini">
  <file path="samples/chart/jersey-edition-board/mini/pages/index.html">
```html
<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>一队，几种颜色？</title><link rel="stylesheet" href="style.css"><script src="app.js" defer></script><header><a href="../../../../../../index.html" target="_top">← Samples</a><span>COLORS OF THE COURT / 2023–24</span></header><main><section class="intro"><div><p>球衣版本 · 全联盟穿着比例</p><h1>一队，<br>几种颜色？</h1></div><div><p class="lead">认得你的球队，<br>也认得它每一套球衣吗？</p><p>从 30 支球队中选一队，查看各版本在原赛季记录中的出场比例。点击列名，比较谁最常穿这一版。</p><label for="team">你的球队</label><select id="team"></select></div></section><section class="board"><div class="board-title"><h2 id="team-title"></h2><p id="games"></p></div><div id="wardrobe"></div><p class="hint">点球衣查看原图 · 按列名排序 · 点击球队切换主角</p><p class="mobile-hint">左右滑动可比较完整五列</p><div class="table-scroll" tabindex="0" aria-label="全联盟球衣版本比较表"><table><thead><tr><th scope="col">球队</th></tr></thead><tbody></tbody></table></div><p class="footnote">比例按各队记录数独立计算，四舍五入后合计可能不等于 100%。原数据含季中锦标赛决赛。湖人的 City 2 计入 City，详情可查看两套原图。</p></section><footer><a href="https://pudding.cool/2024/10/nba-uniforms/">原作 ↗</a><a href="SAMPLE.md">来源与复核</a><span>插画：The Basketball Jersey Database / Abram Baclagon</span></footer></main><dialog aria-labelledby="detail-title"><button id="close">关闭 ×</button><h2 id="detail-title"></h2><div id="images"></div><p id="detail-caption"></p></dialog><link rel="stylesheet" href="mini-scrollbars.css"></html>
```
  </file>
  <file path="samples/chart/jersey-edition-board/mini/pages/app.js">
```javascript
const $=id=>document.getElementById(id),editions=['association','icon','statement','city','classic'],labels=['Association','Icon','Statement','City','Classic'];const descriptions=['常规白色款','球队标志色款','另一套球队配色','以城市文化为灵感','复古版本'];let teams=[],rows=[],selected='POR',sorted='association';const dialog=document.querySelector('dialog');
function detail(row,index){const type=editions[index],count=row.counts[index],image=count||type!=='classic'?`${row.code}_${type}.png`:'blank.png';$('detail-title').textContent=`${row.team} / ${labels[index]}`;$('images').replaceChildren();const paths=[image];if(row.code==='LAL'&&type==='city')paths.push('LAL_kobe.png');for(const path of paths){const img=new Image();img.src='assets/jerseys/'+path;img.alt=row.team+' '+path;$('images').append(img)}$('detail-caption').textContent=`${descriptions[index]} · ${count} / ${row.total} 场（${row.percent[index]}%）`+(type==='classic'&&count===0?' · 原记录中未穿着此版本。':'')+(row.code==='LAL'&&type==='city'?' · 原记录含 1 场 City 2，对应右侧 Kobe 原图。':'');dialog.showModal()}
function render(){document.querySelector('.table-scroll').scrollTop=0;const row=rows.find(r=>r.code===selected);$('team').value=selected;$('team-title').textContent=row.team;$('games').textContent=`2023–24 · ${row.total} 场原始记录`;$('wardrobe').replaceChildren();editions.forEach((type,i)=>{const button=document.createElement('button');const img=new Image();img.src=`assets/jerseys/${type==='classic'&&!row.counts[i]?'blank':row.code+'_'+type}.png`;img.alt=row.team+' '+labels[i];const title=document.createElement('strong'),value=document.createElement('span');title.textContent=labels[i];value.textContent=row.percent[i]+'%';button.append(img,title,value);button.onclick=()=>detail(row,i);$('wardrobe').append(button)});
const body=document.querySelector('tbody');const old=new Map([...body.children].map(el=>[el.dataset.code,el.getBoundingClientRect().top]));const index=editions.indexOf(sorted);const order=[row,...rows.filter(r=>r!==row).sort((a,b)=>b.percent[index]-a.percent[index])];for(const r of order){let tr=body.querySelector(`[data-code="${r.code}"]`);if(!tr){tr=document.createElement('tr');tr.dataset.code=r.code;const name=document.createElement('td'),button=document.createElement('button');button.textContent=r.team;button.onclick=()=>{selected=r.code;render()};name.append(button);tr.append(name);r.percent.forEach((p,i)=>{const td=document.createElement('td');td.innerHTML=`<div class="bar"><i style="width:${p}%"></i><span>${p}%</span></div>`;td.title=`${r.counts[i]} / ${r.total} 场`;tr.append(td)})}tr.classList.toggle('selected',r===row);tr.querySelector('button').setAttribute('aria-pressed',String(r===row));body.append(tr)}document.querySelectorAll('th[data-edition]').forEach(th=>th.setAttribute('aria-sort',th.dataset.edition===sorted?'descending':'none'));if(!matchMedia('(prefers-reduced-motion: reduce)').matches)for(const tr of body.children){if(old.has(tr.dataset.code)){const delta=old.get(tr.dataset.code)-tr.getBoundingClientRect().top;if(delta)tr.animate([{transform:`translateY(${delta}px)`},{transform:'translateY(0)'}],{duration:350,easing:'ease-out'})}}}
editions.forEach((type,i)=>{const th=document.createElement('th');th.scope='col';th.dataset.edition=type;const button=document.createElement('button');button.textContent=labels[i]+' ↓';button.onclick=()=>{sorted=type;render()};th.append(button);document.querySelector('thead tr').append(th)});$('team').onchange=()=>{selected=$('team').value;render()};$('close').onclick=()=>dialog.close();
Promise.all([fetch('data/all-games.json').then(r=>r.json()),fetch('data/nba2324/teamNames.json').then(r=>r.json())]).then(([games,names])=>{teams=names;rows=teams.map(t=>{const counts=[0,0,0,0,0];for(const game of games){const side=game.homeTeam===t.team?'home':game.awayTeam===t.team?'away':null;if(!side)continue;const edition=game[side+'TeamEdition'];let index=['Association Edition','Icon Edition','Statement Edition','City Edition','Classic Edition'].indexOf(edition);if(edition==='City 2 Edition')index=3;if(index<0)throw Error('Unknown edition '+edition);counts[index]++}const total=counts.reduce((a,b)=>a+b,0);return{...t,counts,total,percent:counts.map(c=>Math.round(c/total*100))}});for(const t of teams)$('team').add(new Option(t.team,t.code));render();document.body.dataset.ready='true';window.jerseyBoard={snapshot:()=>structuredClone(rows)}}).catch(e=>{$('team-title').textContent='数据加载失败，请刷新重试';console.error(e)});
```
  </file>
  <file path="samples/chart/jersey-edition-board/mini/pages/style.css">
```css
*{box-sizing:border-box}body{margin:0;color:#262624;background:#dcae70 url('assets/imgs/court-bg.jpg') center top/1200px auto;font-family:Arial,"PingFang SC",sans-serif}header{background:#252523;color:#fff;padding:22px max(24px,calc((100vw - 1180px)/2));display:flex;justify-content:space-between;gap:20px;font-size:11px}a{color:inherit;text-underline-offset:4px}main{max-width:1180px;margin:auto}.intro{display:grid;grid-template-columns:1fr 1fr;gap:70px;background:#fff9eeeb;padding:42px 60px;border:3px solid #262624;margin:48px 0}.intro>div>p:first-child{letter-spacing:2px;font-size:12px}h1{font:900 72px/1.08 Arial;margin:18px 0}.intro .lead{font-size:24px!important;letter-spacing:0!important;line-height:1.5}.intro p{font-size:14px;line-height:1.8}.intro label{display:block;font-size:11px;margin-top:24px}select{font:inherit;color:inherit;background:transparent;border:0;border-bottom:2px solid #262624;width:100%;padding:10px 0;cursor:pointer}.board{background:#fffaf2f5;border-top:4px solid #262624;border-bottom:4px solid #262624;padding:32px 40px}.board-title{display:flex;justify-content:space-between;align-items:baseline;gap:20px}.board-title h2{font-size:25px;margin:0}.board-title p{font-size:12px}#wardrobe{display:grid;grid-template-columns:repeat(5,1fr);gap:18px;margin:30px 0 20px}button{font:inherit;color:inherit;cursor:pointer}#wardrobe button{background:transparent;border:0;padding:8px;border-bottom:2px solid #262624}#wardrobe img{height:145px;max-width:100%;object-fit:contain;display:block;margin:0 auto 14px}#wardrobe strong{display:block;font-size:12px}#wardrobe span{display:block;font:24px Georgia;margin-top:8px}.hint,.mobile-hint{font-size:11px;color:#686354;margin:22px 0}.mobile-hint{display:none}.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse;min-width:650px;font-size:12px}th{text-align:left;padding:12px 8px;border-top:1px solid #9a9486;border-bottom:1px solid #9a9486}th:first-child{width:210px}th button{background:none;border:0;padding:7px 0;font-size:11px;font-weight:bold;text-transform:uppercase}th[aria-sort=descending]{background:#e9dcc7}td{padding:10px 8px;border-bottom:1px solid #ddd4c4}td:first-child button{background:none;border:0;padding:0;text-align:left;font-size:12px;font-weight:600}tr.selected{background:#ecdfc6}tr:hover{background:#f3e8d5}.bar{height:20px;border:1px solid #262624;background:white;position:relative;min-width:65px}.bar i{height:100%;display:block;background:#262624}.bar span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;mix-blend-mode:difference;font-size:10px;font-variant-numeric:tabular-nums}.footnote{font-size:11px;color:#686354;line-height:1.8;margin:25px 0 0}footer{display:flex;justify-content:space-between;gap:16px;background:#252523;color:#fff;padding:24px;font-size:11px;margin:40px 0}dialog{background:#fffaf2;color:#262624;border:2px solid;max-width:700px;width:calc(100% - 32px);padding:24px}dialog::backdrop{background:#141410bb}#close{float:right;padding:8px 12px;border:1px solid;background:none}dialog h2{clear:both;padding-top:20px;font-size:20px}#images{display:flex;justify-content:center;gap:25px}#images img{max-width:45%;height:300px;object-fit:contain}#detail-caption{font-size:13px;line-height:1.8}button:hover{opacity:.75}button:focus-visible,select:focus-visible,.table-scroll:focus-visible{outline:3px solid #a74719;outline-offset:3px}@media(max-width:1200px){main{padding:0 24px}}@media(max-width:650px){header span{max-width:150px;text-align:right}.intro{display:block;padding:24px;margin:24px 0}.intro h1{font-size:54px}.intro .lead{font-size:20px!important}.board{padding:24px 16px}.board-title{display:block}.board-title h2{font-size:21px}#wardrobe{grid-template-columns:repeat(3,1fr);gap:14px}#wardrobe img{height:95px}#wardrobe strong{font-size:10px}#wardrobe span{font-size:20px}.mobile-hint{display:block}footer{flex-wrap:wrap}#images img{height:220px}}

/* Team selection stays beside the jersey editions and locally scrolling league table. */
@media(min-width:1200px) and (min-height:700px){
 header{height:56px;padding:20px 36px}main{height:844px;max-width:1600px;display:grid;grid-template-columns:300px minmax(0,1fr);grid-template-rows:minmax(0,1fr) 44px;gap:20px;padding:24px 36px}
 .intro{grid-column:1;grid-row:1;display:flex;flex-direction:column;gap:32px;justify-content:space-between;margin:0;padding:24px;border-width:2px}h1{font-size:48px}.intro .lead{font-size:20px!important}.intro label{margin-top:24px}
 .board{grid-column:2;grid-row:1;min-height:0;padding:20px 24px;display:flex;flex-direction:column}#wardrobe{gap:12px;margin:18px 0 10px}#wardrobe img{height:130px;margin-bottom:8px}#wardrobe span{font-size:22px}.hint{margin:10px 0 14px}.table-scroll{min-height:0;flex:1;overscroll-behavior:contain;scrollbar-gutter:stable}thead{position:sticky;top:0;background:#fffaf2;z-index:1}.footnote{margin:12px 0 0}
 footer{grid-column:1/-1;grid-row:2;margin:0;padding:14px 20px}
}
```
  </file>
  <file path="samples/chart/jersey-edition-board/mini/pages/mini-scrollbars.css">
```css
/* Local scrollbars inherit the surrounding ink, including light/dark themes. */
@supports selector(::-webkit-scrollbar) {
  * { scrollbar-width: auto !important; scrollbar-color: auto !important; }
  *::-webkit-scrollbar { width: 8px !important; height: 8px !important; }
  *::-webkit-scrollbar-track, *::-webkit-scrollbar-corner { background: transparent !important; }
  *::-webkit-scrollbar-thumb {
    background: #8888 !important;
    background: color-mix(in srgb, currentColor 28%, transparent) !important;
    border: 2px solid transparent !important;
    border-radius: 999px !important;
    background-clip: padding-box !important;
    min-height: 28px !important;
    min-width: 28px !important;
  }
  *::-webkit-scrollbar-thumb:hover {
    background-color: color-mix(in srgb, currentColor 46%, transparent) !important;
  }
  *::-webkit-scrollbar-thumb:active {
    background-color: color-mix(in srgb, currentColor 62%, transparent) !important;
  }
}
@supports not selector(::-webkit-scrollbar) {
  * { scrollbar-width: thin !important; scrollbar-color: #8888 transparent !important; }
  @supports (color: color-mix(in srgb, black, transparent)) {
    * { scrollbar-color: color-mix(in srgb, currentColor 28%, transparent) transparent !important; }
    *:hover, *:focus-visible { scrollbar-color: color-mix(in srgb, currentColor 46%, transparent) transparent !important; }
  }
}
@media (forced-colors: active) {
  * { scrollbar-width: auto !important; scrollbar-color: auto !important; }
  *::-webkit-scrollbar-thumb { background: ButtonText !important; }
}
```
  </file>
  <omitted path="../../../../../../index.html">Navigation back to the formal sample gallery.</omitted>
  <omitted path="SAMPLE.md">Local source attribution and approval record; not part of the rendering algorithm.</omitted>
</sample>
