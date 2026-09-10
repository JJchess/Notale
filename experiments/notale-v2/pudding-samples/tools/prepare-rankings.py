from pathlib import Path
import csv,json,hashlib,shutil,subprocess
root=Path(__file__).resolve().parents[1];src=root/'sources/wine-animals';out=root/'review/wine-animal-rankings';(out/'assets').mkdir(parents=True,exist_ok=True)
data={}
for d in csv.DictReader((src/'src/data/wineData_summary.csv').open()):
 if d['animalGroup'] in ['human','none']:continue
 group=data.setdefault(d['animalGroup'],{'animal':d['animalGroup']})
 if d['category']=='median':group[d['bucket']]=float(d['count'])
 if d['bucket']=='steals':group['steals']=float(d['percent']);group['dealsCount']=int(d['count'])
records=[d for d in data.values() if d['animal'] not in ['all','animal wines']]
files=['blank-bottle.png','blank-bottle-outline.png','blank-bottle-horiz.png','blank-bottle-outline-horiz.png']+['icons/'+''.join(c for c in d['animal'] if c.isalnum())+'.png' for d in records]
assets=[]
for name in files:
 f=src/'static/assets/images'/name;dest=out/'assets'/f.name;shutil.copyfile(f,dest);assets.append({'file':'assets/'+f.name,'source':str(f.relative_to(root)),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'bytes':dest.stat().st_size})
for name in ['National-Regular.woff2','Tiempos-Regular.woff2']:
 f=root/'review/wine-bottle-choice/assets'/name;shutil.copyfile(f,out/'assets'/name);assets.append({'file':'assets/'+name,'source':str(f.relative_to(root)),'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'bytes':f.stat().st_size})
(out/'data.json').write_text(json.dumps({'groups':records,'all':data['all'],'animal':data['animal wines']},indent=2));shutil.copyfile(src/'LICENSE',out/'LICENSE.source');(out/'assets.json').write_text(json.dumps({'repo':'https://github.com/the-pudding/wine-animals','commit':subprocess.check_output(['git','-C',str(src),'rev-parse','HEAD'],text=True).strip(),'sourceInputs':['src/components/Intro.SummaryBottles.svelte','src/components/ChartScroll.SummaryBottles.svelte','src/data/wineData_summary.csv'],'assets':assets},indent=2));print(len(records),'groups prepared')
