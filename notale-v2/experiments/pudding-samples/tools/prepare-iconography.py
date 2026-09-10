from pathlib import Path
import json,shutil,hashlib,subprocess
b=Path(__file__).resolve().parents[1];s=b/'sources/aztec-gods';d=b/'review/iconography-lens';d.mkdir(exist_ok=True);manifest=[]
files=[('static/assets/img/'+n,'assets/'+n) for n in ['Tlaltecuhtli-explorable.png','tezca-explorable.png','ezpitzal.png']]+[('src/components/iconography/setup/iconographySetup.js','positions.js'),('src/data/doc.json','source-doc.json')]
for a,c in files:
 p=d/c;p.parent.mkdir(exist_ok=True,parents=True);shutil.copy2(s/a,p);manifest.append({'path':c,'source':a,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size})
(d/'SOURCE-NOTICE.md').write_text('Source: https://github.com/the-pudding/aztec-gods\nIllustrations and story: Gwendal Uguen. Code: Luc Guillemot.\nNo root LICENSE file is present at this source commit. Assets retain their original authorship; this study does not grant a new license.\n');(d/'assets.json').write_text(json.dumps({'repo':'https://github.com/the-pudding/aztec-gods','commit':subprocess.check_output(['git','-C',str(s),'rev-parse','HEAD'],text=True).strip(),'assets':manifest},indent=2)+'\n');print('copied',len(files))
