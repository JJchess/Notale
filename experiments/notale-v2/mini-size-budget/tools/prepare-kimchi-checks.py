import json,re
from pathlib import Path
base=Path('experiments/mini-size-budget');aliases=json.loads((base/'kimchi/build.json').read_text())['aliases']
route="""await p.route('**/grandmas-kimchi-kitchen/mini/pages/**',async r=>{let rel=r.request().url().split('/mini/pages/')[1]||'index.html',file='experiments/mini-size-budget/combined/grandmas-kimchi-kitchen/'+rel;if(fs.existsSync(file))await r.fulfill({path:file});else await r.continue()});"""
for name in ['check-kimchi','check-kimchi-audio','check-kimchi-reduced']:
 s=Path('experiments/mini-1600-audit/tools/'+name+'.cjs').read_text()
 s=s.replace("await p.goto(",route+"await p.goto(",1)
 s=s.replace('experiments/mini-1600-audit','experiments/mini-size-budget/regression').replace('experiments/mini-completion-20260908/grandmas-kimchi-kitchen','experiments/mini-size-budget/kimchi')
 if name=='check-kimchi-reduced':
  a=s.index("const before=await p.locator('canvas')");b=s.index("await p.getByRole('button',{name:'Start the kitchen again'})",a)
  s=s[:a]+s[b:];s=s.replace('resize:true,','viewport:[1600,900],')
 for source,target in aliases.items():s=re.sub(r'(?<![\w-])'+re.escape(source)+r'(?![\w-])',target,s)
 (base/'regression'/f'{name}.cjs').write_text(s)
