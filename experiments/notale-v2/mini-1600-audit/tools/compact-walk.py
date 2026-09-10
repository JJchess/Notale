from pathlib import Path
import json,shutil
p=Path('workflows/build-page/samples/catalog.json');d=json.loads(p.read_text());r=next(x for x in d['samples'] if x['id']=='walk-photo-journal');src=p.parent.parent/r['full']['root'];dst=src.parent/'mini/pages';assert not dst.exists();shutil.copytree(src,dst)
f=dst/'index.html';s=f.read_text().replace('../../../../../index.html','../../../../../../index.html').replace('<div id="wall"','<div id="journey" tabindex="0" aria-label="照片旅程，可局部滚动"><div id="wall"').replace('</section></main>','</section></div></main>');f.write_text(s)
f=dst/'SAMPLE.md';f.write_text(f.read_text().replace('../provenance/','../../provenance/'))
with (dst/'style.css').open('a') as f:f.write('''
/* Journey media scroll locally while day navigation and route progress stay visible. */
@media(min-width:1200px) and (min-height:700px){
 body{height:900px;display:grid;grid-template-rows:60px minmax(0,1fr) 40px}.mast{padding:20px 0}main{height:100%;width:100%;max-width:1600px;min-height:0;display:grid;grid-template-rows:130px 92px minmax(0,1fr);padding:0 36px}.intro{padding:12px 0;gap:32px}h1{font-size:58px}.intro-note{font-size:12px}.intro p{margin:8px 0}.toolbar{position:static;padding:10px 0}#journey{min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;padding-right:8px}.end{padding:35px 0}footer{padding:10px 36px;font-size:10px}
}
''')
f=dst/'app.js';s=f.read_text().replace("wall=$('#wall'),dialog=", "wall=$('#wall'),pane=$('#journey'),dialog=")
s=s.replace("return r.bottom>120&&r.top<innerHeight&&r.right>0&&r.left<innerWidth", "const v=pane.getBoundingClientRect();return r.bottom>v.top&&r.top<v.bottom&&r.right>v.left&&r.left<v.right")
s=s.replace("{threshold:[0,.1]}","{root:pane,threshold:[0,.1]}")
a=s.index('function jump(day)');b=s.index('function schedule()',a)
s=s[:a]+'''function position(card){return card.getBoundingClientRect().top-pane.getBoundingClientRect().top+pane.scrollTop}
function jump(day){pane.scrollTo({top:position(cards[day])-18,behavior:reduce.matches?'instant':'smooth'})}
function progress(){const y=pane.scrollTop+20;let i=0;for(let n=1;n<cards.length;n++)if(position(cards[n])<=y)i=n;const start=position(cards[i]),end=cards[i+1]?position(cards[i+1]):position(wall)+wall.offsetHeight;const frac=Math.min(1,Math.max(0,(y-start)/(end-start)));const d=data.days[i];let steps=d.start+frac*d.steps;if(pane.clientHeight+pane.scrollTop>=pane.scrollHeight-3)steps=data.totalSteps;$('#steps').textContent=Math.round(steps).toLocaleString();path.style.strokeDashoffset=length*(1-steps/data.totalSteps);$('#days').querySelectorAll('button').forEach(b=>b.setAttribute('aria-current',+b.dataset.day===i));window.walkDebug={items:data.items.length,day:i,steps,motion,selected};playback()}
''' +s[b:]
s=s.replace("addEventListener('scroll',schedule", "pane.addEventListener('scroll',schedule").replace("$('#back-top').onclick=()=>scrollTo(", "$('#back-top').onclick=()=>pane.scrollTo(")
f.write_text(s)
spec=json.loads(json.dumps(r['full']));spec['root']=str(dst.relative_to(p.parent.parent));spec['omitted']={k.replace('../../../../../index.html','../../../../../../index.html'):v for k,v in spec['omitted'].items()};spec['chars']=sum(len((dst/f).read_text()) for f in spec['files']);r['mini']=spec;p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
