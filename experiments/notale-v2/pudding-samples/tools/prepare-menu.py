import json,shutil,hashlib,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1];src=root/'sources/menu-story';out=root/'review/menu-reading-room'
slides=json.loads((src/'src/data/copy.json').read_text())['slides'];records=[];assets=[]
for i,title,description in [(9,'A menu printed on silk','At Astor House, the menu itself was a luxury object. Read its French dishes on the original silk scan.'),(8,'French from beginning to end','From potages to glaces, French names organize this Manhattan Club dinner. Follow the courses down the page.'),(7,'Begin with potages','At Delmonico’s, the soups appear near the top of a long French menu. Move closer to read the printed names.')]:
 s=slides[i];f=src/'static'/s['bgSrc'];dest=out/'assets'/f.name;shutil.copyfile(f,dest)
 from PIL import Image
 im=Image.open(f)
 records.append({'file':f.name,'title':title,'description':description,'label':s['topLabel'],'width':im.width,'height':im.height,'sourceSlide':i,'focalX':float(s.get('focalX',490)),'focalY':float(s.get('focalY',250)),'annotationX':float(s.get('annotationX',s.get('focalX',490))),'annotationY':float(s.get('annotationY',s.get('focalY',250)))})
 assets.append({'file':'assets/'+f.name,'source':str(f.relative_to(root)),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'bytes':dest.stat().st_size})
f=src/'static/assets/pointer.png';dest=out/'assets/pointer.png';shutil.copyfile(f,dest)
assets.append({'file':'assets/pointer.png','source':str(f.relative_to(root)),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'bytes':dest.stat().st_size})
(out/'data.json').write_text(json.dumps(records,indent=2))
shutil.copyfile(src/'LICENSE',out/'LICENSE.source')
(out/'assets.json').write_text(json.dumps({'repo':'https://github.com/the-pudding/menu-story','commit':subprocess.check_output(['git','-C',str(src),'rev-parse','HEAD'],text=True).strip(),'sourceInputs':['src/components/SwiperStory.svelte','src/data/copy.json'],'assets':assets},indent=2))
print('Prepared',len(assets),'original menu scans')
