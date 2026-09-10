from pathlib import Path
import csv,json,shutil,hashlib,subprocess
b=Path(__file__).resolve().parents[1];src=b/'sources/walkachusetts';out=b/'review/walk-photo-journal';(out/'assets').mkdir(parents=True,exist_ok=True);(out/'shots').mkdir(exist_ok=True)
assets=[];seen=set()
def copy(rel):
 p=src/rel;target='assets/'+str(Path(rel).relative_to('static/assets')) if rel.startswith('static/assets/') else 'assets/'+Path(rel).name
 if target not in seen:
  dest=out/target;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,dest);seen.add(target);assets.append(dict(source=rel,file=target,sha256=hashlib.sha256(p.read_bytes()).hexdigest(),bytes=p.stat().st_size))
 return target
media=sorted([r for r in csv.DictReader((src/'src/data/media.csv').open()) if r['tldr_order']],key=lambda r:int(r['tldr_order']))
items=[]
for r in media:
 video=r['src'].startswith('videos');preview=r['src'].replace('videos/','images-webp/').replace('images/','images-webp/').replace('.mp4','.webp').replace('.jpg','.webp')
 items.append(dict(id=Path(r['src']).stem,day=int(r['day']),order=int(r['tldr_order']),kind='video' if video else 'image',alt=r['alt'] or Path(r['src']).stem.replace('-',' '),preview=copy('static/assets/'+preview),src=copy('static/assets/'+r['src']),frame=copy('static/assets/illos/frame-'+str((int(r['sidebar_order'])%5)+1 if r['sidebar_order'] else 1)+'.png')))
copydata=json.loads((src/'src/data/copy.json').read_text());sections=[s for s in copydata['body'] if any(c['type']=='Abridged' for c in s['content'])][:9]
summaries=['把行李铺开，准备从 Cambridge 步行回家。','和母亲同行出发，穿过街道与旧铁路步道。','道路、树林和秋日集市交替出现。','一根手杖，陪伴脚趾疼痛的一天。','橡果游戏，让重复的步伐有了变化。','浓雾中的长路，酒馆里遇见同名的人。','沿铁路步道前行，在 Northampton 与家人相聚。','疲惫、山坡，以及农场里的一夜。','天亮前出发，日落后终于抵达家门。']
days=[];total=0
for i,s in enumerate(sections):
 abr=next(c['value'] for c in s['content'] if c['type']=='Abridged');steps=int(s.get('steps',0));days.append(dict(day=i,title='出发之前' if not i else f'DAY {i:02}',summary=summaries[i],steps=steps,start=total,end=total+steps,section='hero' if not i else s['section'],illo=copy('static/assets/'+abr['image'].replace('illos/','illos-webp/').replace('.png','.webp'))));total+=steps
route=copy('src/svg/route.svg');shutil.copyfile(src/'LICENSE',out/'LICENSE.source')
(out/'data.json').write_text(json.dumps(dict(items=items,days=days,totalSteps=total,route=route),ensure_ascii=False,indent=2)+'\n')
inputs=['src/data/media.csv','src/data/copy.json','src/components/Tldr.svelte','src/components/Sticky.svelte','src/components/Figure.svelte','src/utils/cleanFigures.js']
manifest=dict(repo='https://github.com/the-pudding/walkachusetts',commit=subprocess.check_output(['git','-C',str(src),'rev-parse','HEAD'],text=True).strip(),assets=assets,sourceInputs=[dict(source=p,sha256=hashlib.sha256((src/p).read_bytes()).hexdigest()) for p in inputs],note='All media and original route SVG copied byte-for-byte. No image transcoding or vector substitutes.')
(out/'assets.json').write_text(json.dumps(manifest,indent=2)+'\n');print(len(items),'media',len(assets),'assets',total,'steps')
