from pathlib import Path
import json,shutil,hashlib,collections,subprocess
b=Path(__file__).resolve().parents[1];s=b/'sources/nba-uniforms';d=b/'review/jersey-edition-board';d.mkdir(exist_ok=True)
paths=list((s/'static/assets/jerseys').glob('*.png'))+[s/'static/assets/imgs/court-bg.jpg',s/'src/data/all-games.json',s/'src/data/nba2324/teamNames.json']
manifest=[]
for p in paths:
 rel=Path(str(p.relative_to(s)).replace('static/','').replace('src/',''));out=d/rel;out.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,out);manifest.append({'path':str(rel),'source':str(p.relative_to(s)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size})
shutil.copy2(s/'LICENSE',d/'LICENSE.source');(d/'assets.json').write_text(json.dumps({'repo':'https://github.com/the-pudding/nba-uniforms','commit':subprocess.check_output(['git','-C',str(s),'rev-parse','HEAD'],text=True).strip(),'assets':manifest},indent=2)+'\n');print(len(manifest))
