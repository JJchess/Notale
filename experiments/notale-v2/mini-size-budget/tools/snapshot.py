from pathlib import Path
import json,hashlib,re
base=Path('experiments/mini-size-budget');rows=[]
for c in Path('workflows').glob('*/samples/catalog.json'):
 for r in json.loads(c.read_text())['samples']:
  m=r.get('mini')
  if not m:continue
  root=c.parent.parent/m['root']
  n=sum(len((root/f).read_text()) for f in m['files'] if Path(f).suffix in ['.html','.css','.js','.mjs'])
  if n<=15429:continue
  files=set(m['files'])
  html=(root/'index.html').read_text()
  files|={v.removeprefix('./') for v in re.findall(r'(?:src|href)=[\'"]([^\'"]+)',html) if not v.startswith(('http','../')) and (root/v).is_file()}
  for f in files:
   dest=base/'before'/r['id']/f;dest.parent.mkdir(parents=True,exist_ok=True)
   if not dest.exists():dest.write_bytes((root/f).read_bytes())
  rows.append({'id':r['id'],'workflow':c.parent.parent.name,'root':str(root),'spec':m,'original_count':n,'all_author_count':sum(len((root/f).read_text()) for f in m['files'] if Path(f).suffix not in ['.csv','.json']),'full_hashes':{str(c.parent.parent/r['full']['root']/f):hashlib.sha256((c.parent.parent/r['full']['root']/f).read_bytes()).hexdigest() for f in r['full']['files']}})
assert len(rows)==14
p=base/'baseline.json'
if not p.exists():p.write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
print('14 baseline source snapshots retained')
