from pathlib import Path
import json,shutil,re
p=Path('workflows/build-page/samples/catalog.json');d=json.loads(p.read_text());r=next(x for x in d['samples'] if x['id']=='dress-code-clothing');src=p.parent.parent/r['full']['root'];dst=src.parent/'mini/pages';assert not dst.exists();shutil.copytree(src,dst)
f=dst/'index.html';s=f.read_text().replace('../../../../../index.html','../../../../../../index.html')
body=re.search(r'<main>(.*?)</main>',s,re.S)[1];intro,rest=body.split('<section class="clothes">',1);chart,rest=rest.split('<article id="explanation"',1);explanation='<article id="explanation"'+rest
body='<aside class="story">'+intro+explanation+'</aside><div class="chart-desk"><section class="clothes">'+chart+'</div>'
s=re.sub(r'<main>.*?</main>','<main>'+body+'</main>',s,flags=re.S);f.write_text(s)
f=dst/'SAMPLE.md';f.write_text(f.read_text().replace('../provenance/','../../provenance/')+'\nSingle-slide mini: story and five steps beside the complete chart; methods expand in a local scrolling region. Full source is unchanged.\n')
with (dst/'style.css').open('a') as f:f.write('''
/* All labels and the five explanations share one slide. Methods scroll locally. */
@media(min-width:1200px) and (min-height:700px){
 body{height:900px;display:grid;grid-template-rows:64px minmax(0,1fr) 70px}
 header,footer{width:100%;max-width:1600px;padding:18px 36px}footer{padding-top:10px}footer p{margin-top:6px}
 main{width:100%;max-width:1600px;min-height:0;padding:24px 36px;display:grid;grid-template-columns:340px minmax(0,1fr);gap:36px}
 .story{min-height:0;display:flex;flex-direction:column;gap:16px}.intro{gap:12px}.intro img{width:60px;height:60px}h1{font-size:40px}.eyebrow{font-size:12px}.lead{font-size:15px;line-height:1.65;margin:0}
 nav{gap:6px}nav button{font-size:16px;padding:7px 10px}#explanation{font-size:15px;line-height:1.65;padding:14px;margin:0}
 details{min-height:0;margin:0;padding:12px 0;overflow:auto;flex:1}summary{font-size:18px}details p,details #short-notes{font-size:14px;line-height:1.7;margin:14px 0}
 .chart-desk{min-width:0;display:flex;flex-direction:column;justify-content:center}figure{margin:0}.hint{margin:18px 0 10px}#item-detail{font-size:17px;min-height:66px}
}
''')
spec=json.loads(json.dumps(r['full']));spec['root']=str(dst.relative_to(p.parent.parent));spec['omitted']={k.replace('../../../../../index.html','../../../../../../index.html'):v for k,v in spec['omitted'].items()};spec['chars']=sum(len((dst/f).read_text()) for f in spec['files']);r['mini']=spec;p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
