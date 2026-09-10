from pathlib import Path
import json,hashlib
from core.sample_bundles import omitted_lines
base=Path('experiments/mini-size-budget');counts=json.loads((base/'plain-refined.json').read_text());eligible={r['id']:r for r in counts if r['chars']<=15429};snap={r['id']:r for r in json.loads((base/'baseline.json').read_text())};prepared=[]
for c in Path('workflows').glob('*/samples/catalog.json'):
 data=json.loads(c.read_text());dirty=False
 for row in data['samples']:
  if row['id'] not in eligible:continue
  id=row['id'];root=c.parent.parent/row['mini']['root'];html=(base/'combined'/id/'index.html').read_text();spec={'root':row['mini']['root'],'chars':len(html),'files':['index.html'],'omitted':dict(snap[id]['spec'].get('omitted',{}))}
  extras={'pocket-fit-desk':{'assets/images/*':'Original object photographs selected by item ID; no rendering or interaction code.'},'foundation-shade-desk':{'assets/img/*':'Original collage images selected by comparison group; no rendering or interaction code.'},'masked-wrestler-index':{'assets/spritesheet.png':'Original mask sprite image, preserved byte-for-byte.'}}
  spec['omitted'].update(extras.get(id,{}))
  if id=='artist-repetition-lab':
   spec['omitted'].pop('app.js',None)
   for f in ['artist-index.json','histogram.json']:spec['omitted']['assets/'+f]='Original numeric dataset or artist-to-file lookup, preserved without removing records; contains no rendering or interaction code.'
  omitted_lines(id,spec,html)
  prepared.append((root,html,id));row['mini']=spec;dirty=True
  eligible[id]['sha256']=hashlib.sha256(html.encode()).hexdigest()
 if dirty:prepared.append((c,json.dumps(data,ensure_ascii=False,indent=2)+'\n',None))
# All contracts have passed before mutating runnable entries/catalogs.
for p,text,id in prepared:
 if id:
  (p/'index.html').write_text(text)
  if id=='artist-repetition-lab':
   for f in (base/'combined'/id/'assets').iterdir():(p/'assets'/f.name).write_bytes(f.read_bytes())
 else:p.write_text(text)
(base/'installed.json').write_text(json.dumps(list(eligible.values()),ensure_ascii=False,indent=2)+'\n')
print('Installed',len(eligible),'complete single-file minis.')
