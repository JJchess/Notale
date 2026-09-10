from pathlib import Path
import csv,json,shutil,hashlib,subprocess,collections
b=Path(__file__).resolve().parents[1];src=b/'sources/romance-covers-new';out=b/'review/illustrated-cover-shelves';(out/'assets').mkdir(parents=True,exist_ok=True);(out/'shots').mkdir(exist_ok=True)
rows=list(csv.DictReader((src/'src/data/listings.csv').open()));selected=[r for r in rows if 'http' in r['cover_url'] and r['Style']=='Illustrated'];assets=[];books=[]
for r in selected:
 rel=f"static/assets/images/covers/img_{r['ISBN']}.jpg";p=src/rel;target='assets/'+p.name;shutil.copyfile(p,out/target);assets.append(dict(source=rel,file=target,sha256=hashlib.sha256(p.read_bytes()).hexdigest(),bytes=p.stat().st_size));books.append(dict(isbn=r['ISBN'],year=int(r['year']),title=r['title'],author=r['author'],publisher=r['publisher'],src=target))
years=[]
for y in range(2011,2024):
 total=sum(int(r['year'])==y for r in rows);count=sum(r['year']==y for r in books);years.append(dict(year=y,total=total,count=count,percent=int(count/total*100+.5)))
(out/'data.json').write_text(json.dumps(dict(books=books,years=years),ensure_ascii=False,indent=2)+'\n');shutil.copyfile(src/'LICENSE',out/'LICENSE.source')
inputs=['src/data/listings.csv','src/components/Index.svelte','src/components/Wall.svelte','src/components/Wall.Book.svelte','src/components/Wall.Shelf.svelte','src/components/BarChart.svelte','src/components/AddButton.svelte']
(out/'assets.json').write_text(json.dumps(dict(repo='https://github.com/the-pudding/romance-covers-new',commit=subprocess.check_output(['git','-C',str(src),'rev-parse','HEAD'],text=True).strip(),assets=assets,sourceInputs=[dict(source=r,sha256=hashlib.sha256((src/r).read_bytes()).hexdigest()) for r in inputs]),indent=2)+'\n');print(len(books),years)
