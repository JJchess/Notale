from pathlib import Path
import json,importlib.util,hashlib
from PIL import Image
from collections import Counter
root=Path(__file__).resolve().parents[3];research=root/'experiments/pudding-samples';spec=importlib.util.spec_from_file_location('promote',research/'tools/promote-samples.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
from sys import path
path.insert(0,str(root))
from core.sample_shots import _sheet
states=json.loads((research/'tools/promoted-shot-states.json').read_text());report=json.loads((research/'evidence/promotion.json').read_text());mapping={r['id']:r for r in report['samples']}
# Catalog variants include authored source and local data needed to understand the model.
for workflow in ['build-page','build-interaction']:
 skill=root/'workflows'/workflow;f=skill/'samples/catalog.json';catalog=json.loads(f.read_text())
 for row in catalog['samples']:
  if row['id'] not in mapping:continue
  shared_mini=row.get('mini')==row['full']
  r=mapping[row['id']];pages=root/Path(r['entry']).parent;spec=m.spec_for(pages,row['id']);spec['root']=pages.relative_to(skill).as_posix();row['full']=spec
  if shared_mini:row['mini']=spec.copy()
  row['shots']=[{'label':'初态','wait':2200},{'label':states[row['id']][0],'after':states[row['id']][1],'wait':3000 if row['id']=='masked-wrestler-index' else 1500}]
  shots=pages.parent/'shots';thumbs=[]
  for n in ['00','01']:
   image=Image.open(shots/(n+'.png'));image.resize((800,450),Image.Resampling.LANCZOS).save(shots/(n+'.png'));thumbs.append(shots/(n+'.png'))
  _sheet(thumbs,[s['label'] for s in row['shots']],pages.parent/'shots.png')
  r['source_chars']=spec['chars']
  source=research/'review'/row['id'];unchanged=[];changed=[]
  for f0 in source.rglob('*'):
   if not f0.is_file() or any(x in {'node_modules','shots','upstream'} for x in f0.relative_to(source).parts):continue
   rel=f0.relative_to(source);target=pages/rel
   if not target.is_file():continue
   if f0.read_bytes()==target.read_bytes():unchanged.append(str(rel))
   else:changed.append(str(rel))
  media=[rel for rel in unchanged if Path(rel).suffix.lower() in {'.png','.jpg','.jpeg','.webp','.gif','.mp4','.mp3','.wav','.webm','.woff','.woff2','.ttf','.csv','.json','.svg'}]
  # Binary originals may never be changed during registration/build.
  assert not [rel for rel in changed if Path(rel).suffix.lower() in {'.png','.jpg','.jpeg','.webp','.gif','.mp4','.mp3','.wav','.webm','.woff','.woff2','.ttf','.csv','.svg'}],row['id']
  r['unchanged_files']=len(unchanged);r['unchanged_media_data_fonts']=len(media);r['changed_files']=changed
 f.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
(research/'evidence/promotion.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print('Catalogs, 29 contact sheets and media preservation audit refreshed',Counter(r['category'] for r in report['samples']))
