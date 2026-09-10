from pathlib import Path
import json,shutil
p=Path('workflows/build-page/samples/catalog.json');d=json.loads(p.read_text());r=next(x for x in d['samples'] if x['id']=='pantheon-index');src=p.parent.parent/r['full']['root'];dst=src.parent/'mini/pages';assert not dst.exists();shutil.copytree(src,dst)
f=dst/'index.html';f.write_text(f.read_text().replace('../../../../../index.html','../../../../../../index.html'))
f=dst/'SAMPLE.md';f.write_text(f.read_text().replace('../provenance/','../../provenance/'))
with (dst/'style.css').open('a') as f:f.write('''
/* Preserve the spatial index in full; only the selected article scrolls. */
@media(min-width:1200px) and (min-height:700px){
 main{width:100%;height:900px;display:grid;grid-template-rows:30px 64px 60px 24px minmax(0,1fr) 36px;gap:8px;padding:24px 40px}
 header{padding-bottom:12px}.heading{margin:0}.heading h1{font-size:38px}.toolbar{padding:10px 0}#search-status{margin:0;align-self:center}
 .workspace{min-height:0;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:40px}.workspace>section{min-height:0;display:flex;flex-direction:column}
 .map-scroll{min-height:0;flex:1;display:flex;align-items:center;justify-content:center}#map{width:540px;min-width:0;flex:none}.legend{margin:6px 0 0;flex:none}
 aside{min-height:0;display:grid;grid-template-columns:180px minmax(0,1fr);grid-template-rows:28px 40px 104px 40px minmax(0,1fr);gap:8px;padding:0}
 #portrait{grid-column:1;grid-row:1/4;height:180px;margin:0}.detail-top{grid-column:2;grid-row:1}#name{grid-column:2;grid-row:2;margin:0;font-size:25px;align-self:center}#bio{grid-column:2;grid-row:3;margin:0;overflow:auto}
 .detail-tabs{grid-column:1/-1;grid-row:4;margin:0;align-items:center}#content{grid-column:1/-1;grid-row:5;min-height:0;max-height:none;overscroll-behavior:contain}
 footer{margin:0;padding-top:12px;align-items:start}
}
''')
f=dst/'app.js';s=f.read_text();s=s.replace('(width-40)+10)', '(width-rad-4)+rad/2+2)');f.write_text(s)
spec=json.loads(json.dumps(r['full']));spec['root']=str(dst.relative_to(p.parent.parent));spec['omitted']={k.replace('../../../../../index.html','../../../../../../index.html'):v for k,v in spec['omitted'].items()};spec['chars']=sum(len((dst/f).read_text()) for f in spec['files']);r['mini']=spec;p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
