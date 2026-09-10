from pathlib import Path
import json
b=Path('experiments/mini-size-budget');s=Path('experiments/mini-1600-audit/tools/check-crokinole.cjs').read_text().replace('experiments/mini-1600-audit/','experiments/mini-size-budget/regression/');a=json.loads((b/'crokinole/build.json').read_text())['aliases']
for x,y in a.items():s=s.replace('.'+x+',','.'+y+',')
route="""await p.route('**/crokinole-shot-lab/mini/pages/**',async r=>{const rel=r.request().url().split('/mini/pages/')[1]||'index.html',f='experiments/mini-size-budget/combined/crokinole-shot-lab/'+rel;if(fs.existsSync(f))await r.fulfill({path:f});else await r.continue()});"""
s=s.replace('await p.goto(',route+'await p.goto(');(b/'regression/check-crokinole-shot-lab.cjs').write_text(s)
