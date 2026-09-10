from pathlib import Path
import json,shutil
changes={
'music-sample-pair':('build-page','''\n/* Keep the two recordings and transport within one 1600 × 900 slide. */\n@media(min-width:1200px) and (min-height:700px){main{height:900px;min-height:0;max-width:1280px;gap:140px;padding:28px 60px}.pair{width:250px}.connection{height:60px}.eyebrow{margin-top:36px}footer{margin-top:24px}}\n'''),
'flipbook-branches':('build-page','''\n/* A square frame with its complete transport fits beside the explanation. */\n@media(min-width:1200px) and (min-height:700px){main{height:900px;padding:26px 48px}.layout{grid-template-columns:minmax(0,1fr) 540px;gap:70px;margin:24px 0}header{padding-bottom:20px}aside{padding-top:10px}footer{padding-top:16px}}\n'''),
'onion-cut-lab':('build-interaction','''\n/* Recover spacing around the experiment without reducing its geometry. */\n@media(min-width:1200px) and (min-height:700px){main{height:900px}.intro{padding:16px 0}footer{margin-top:18px}.lab{padding-top:22px}}\n''')}
for sid,(wf,css) in changes.items():
 p=Path(f'workflows/{wf}/samples/catalog.json');d=json.loads(p.read_text());r=next(x for x in d['samples'] if x['id']==sid)
 dst=p.parent/r['category']/sid/'mini/pages';src=p.parent.parent/r['full']['root'];assert not dst.exists(),dst
 shutil.copytree(src,dst)
 for name in ('index.html','SAMPLE.md'):
  f=dst/name
  if f.exists():f.write_text(f.read_text().replace('../../../../../index.html','../../../../../../index.html').replace('../provenance/','../../provenance/'))
 with (dst/'style.css').open('a') as f:f.write(css)
 spec=json.loads(json.dumps(r['full']));spec['root']=str(dst.relative_to(p.parent.parent));spec['omitted']={k.replace('../../../../../index.html','../../../../../../index.html'):v for k,v in spec.get('omitted',{}).items()};spec['chars']=sum(len((dst/f).read_text()) for f in spec['files']);r['mini']=spec
 p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
 print(sid,spec['chars'])
