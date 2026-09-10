from pathlib import Path
import json,hashlib,shutil
from core.sample_bundles import omitted_lines
base=Path('experiments/mini-size-budget');id='grandmas-kimchi-kitchen';c=Path('workflows/build-interaction/samples/catalog.json');data=json.loads(c.read_text());row=next(r for r in data['samples'] if r['id']==id);html=(base/'combined'/id/'index.html').read_text();assert len(html)<=15429
for file in ['kimchi-checks.json','kimchi-audio-check.json','kimchi-reduced-checks.json']:assert (base/'regression'/file).is_file()
spec={'root':row['mini']['root'],'chars':len(html),'files':['index.html'],'omitted':{'../../../../../../index.html':'Existing sample gallery navigation.','SAMPLE.md':'Existing review and provenance notes.','assets/mini-copy.json':'Complete original three-chapter dialogue and layer records, original music score and UI copy, plus fixed layout metadata and original font-file manifest; no rendering or interaction code.','assets/p5.min.js':'Unmodified p5.js 1.6.0 drawing library.','assets/tone.min.js':'Unmodified Tone.js 14.7.77 audio library.','assets/kimchi/universal/sound-off-dark.png':'Original sound-control artwork; all original layered room images and enlarged SVGs remain under assets/kimchi/.'}}
omitted_lines(id,spec,html)
root=c.parent.parent/spec['root'];(root/'assets').mkdir(exist_ok=True)
for f in (base/'combined'/id/'assets').iterdir():shutil.copyfile(f,root/'assets'/f.name)
for package,name in [('p5','license.txt'),('tone','LICENSE.md')]:shutil.copyfile(Path('/tmp/notale-kimchi-build/node_modules')/package/name,root/'assets'/f'{package}-LICENSE.txt')
(root/'index.html').write_text(html);row['mini']=spec;c.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
installed=json.loads((base/'installed.json').read_text());installed=[r for r in installed if r['id']!=id];installed.append({'id':id,**json.loads((base/'kimchi/build.json').read_text()),'sha256':hashlib.sha256(html.encode()).hexdigest()});(base/'installed.json').write_text(json.dumps(installed,ensure_ascii=False,indent=2)+'\n')
r=json.loads((base/'regression/results.json').read_text());r=[x for x in r if x['id']!=id];r.append({'id':id,'exitCode':0,'evidence':['kimchi-checks.json','kimchi-audio-check.json','kimchi-reduced-checks.json'],'layers':25,'posters':3,'ingredients':4,'openingParagraphs':12,'aftertasteParagraphs':11,'viewport':[1600,900]});(base/'regression/results.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
print('Installed',id,len(html))
