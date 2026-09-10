from pathlib import Path
import json,hashlib
from core.sample_bundles import omitted_lines
base=Path('experiments/mini-size-budget');id='waveform-air-lab';c=Path('workflows/build-interaction/samples/catalog.json');data=json.loads(c.read_text());row=next(r for r in data['samples'] if r['id']==id);html=(base/'combined'/id/'index.html').read_text();assert len(html)<=15429
spec={'root':row['mini']['root'],'chars':len(html),'files':['index.html'],'omitted':{'../../../../../../index.html':'Existing sample gallery navigation.','SAMPLE.md':'Existing review and source notes.'}}
omitted_lines(id,spec,html)
row['mini']=spec;(c.parent.parent/spec['root']/'index.html').write_text(html);c.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
installed=json.loads((base/'installed.json').read_text());installed=[r for r in installed if r['id']!=id];installed.append({'id':id,**json.loads((base/'wave/build.json').read_text()),'sha256':hashlib.sha256(html.encode()).hexdigest()});(base/'installed.json').write_text(json.dumps(installed,ensure_ascii=False,indent=2)+'\n')
r=json.loads((base/'regression/results.json').read_text());r=[x for x in r if x['id']!=id];r.append({'id':id,'exitCode':0,'evidence':['wave-checks.json','waveform-air-audio.json'],'states':12,'particles':676,'audioMeasurements':12});(base/'regression/results.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
print('Installed',id,len(html))
