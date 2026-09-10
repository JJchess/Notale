from pathlib import Path
import json,shutil,hashlib,subprocess
b=Path(__file__).resolve().parents[1];s=b/'sources/pockets';d=b/'review/pocket-fit-desk';d.mkdir(exist_ok=True)
files=['src/assets/data/measurementsRectangles.json','src/assets/scripts/d3.v4.12.0+jetpack.min.js','src/js/pudding-chart/fit-template.js']+['src/assets/images/'+n+'.png' for n in ['iphone','galaxy','pixel','frontWallet','pen','womenHand','menHand']]
a=[]
for f in files:
 target=f.removeprefix('src/') if '/assets/' in f else 'fit-template.js';p=d/target;p.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(s/f,p)
 a.append({'path':target,'source':f,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size})
# The original resizes chart geometry using viewport width, changing the x/y ratio.
# Fix the internal coordinate system at original desktop dimensions; CSS handles layout.
p=d/'fit-template.js';t=p.read_text();start=t.index('\t\t\t\tlet chartWidth = null');end=t.index('\n\n',start);t=t[:start]+'\t\t\t\tconst chartWidth = 225 // Stable source desktop coordinate system on every viewport.'+t[end:];p.write_text(t)
a[2]['adapted_sha256']=hashlib.sha256(p.read_bytes()).hexdigest()
shutil.copy2(s/'LICENSE',d/'LICENSE.source')
(d/'assets.json').write_text(json.dumps({'repo':'https://github.com/the-pudding/pockets','commit':subprocess.check_output(['git','-C',str(s),'rev-parse','HEAD'],text=True).strip(),'files':a,'adaptation':'fit-template.js: chartWidth fixed at original desktop 225. All path, placement, measurement and fit formulas unchanged. Recorded hash is upstream original.'},indent=2)+'\n')
