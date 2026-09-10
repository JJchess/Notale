from pathlib import Path
import json,hashlib,shutil
from core.sample_bundles import omitted_lines
base=Path('experiments/mini-size-budget');id='crokinole-shot-lab';c=Path('workflows/build-interaction/samples/catalog.json');data=json.loads(c.read_text());row=next(r for r in data['samples'] if r['id']==id);html=(base/'combined'/id/'index.html').read_text();assert len(html)<=15429
spec={'root':row['mini']['root'],'chars':len(html),'files':['index.html'],'omitted':{'../../../../../../index.html':'Existing sample gallery navigation.','SAMPLE.md':'Existing review and source notes.','assets/scenarios.json':'Complete original training-position dataset; no rendering or interaction code.','assets/matter-0.20.0.min.js':'Unmodified Matter.js 0.20.0 physics library.','assets/howler-2.2.4.min.js':'Unmodified Howler 2.2.4 audio library.'}}
omitted_lines(id,spec,html)
root=c.parent.parent/spec['root'];(root/'assets').mkdir(exist_ok=True)
for f in (base/'combined'/id/'assets').iterdir():shutil.copyfile(f,root/'assets'/f.name)
shutil.copyfile('/tmp/notale-crokinole-build/node_modules/matter-js/LICENSE',root/'assets/matter-LICENSE.txt')
row['mini']=spec;(root/'index.html').write_text(html);c.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
installed=json.loads((base/'installed.json').read_text());installed=[r for r in installed if r['id']!=id];installed.append({'id':id,**json.loads((base/'crokinole/build.json').read_text()),'sha256':hashlib.sha256(html.encode()).hexdigest()});(base/'installed.json').write_text(json.dumps(installed,ensure_ascii=False,indent=2)+'\n')
r=json.loads((base/'regression/results.json').read_text());r=[x for x in r if x['id']!=id];r.append({'id':id,'exitCode':0,'evidence':['crokinole-checks.json','crokinole-extra.json'],'centerScore':30,'opponentContact':True,'invalidRemoved':True,'keyboardHold':True,'soundPlayback':True,'mute':True});(base/'regression/results.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
print('Installed',id,len(html))
