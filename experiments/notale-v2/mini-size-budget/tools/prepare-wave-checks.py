from pathlib import Path
import json
base=Path('experiments/mini-size-budget');alias=json.loads((base/'wave/build.json').read_text())['aliases']
for src,name in [('check-wave.cjs','check-waveform-air-lab.cjs'),('check-wave-audio.cjs','check-wave-audio.cjs')]:
 s=(Path('experiments/mini-1600-audit/tools')/src).read_text().replace('experiments/mini-1600-audit/','experiments/mini-size-budget/regression/')
 for a,b in alias.items(): s=s.replace('.'+a+'.','.'+b+'.').replace('.'+a+',','.'+b+',').replace('.'+a+"'",'.'+b+"'").replace('.'+a+' ','.'+b+' ')
 s=s.replace("await p.goto(","await p.route('**/waveform-air-lab/mini/pages/',r=>r.fulfill({path:'experiments/mini-size-budget/combined/waveform-air-lab/index.html'}));await p.goto(")
 (base/'regression'/name).write_text(s)
