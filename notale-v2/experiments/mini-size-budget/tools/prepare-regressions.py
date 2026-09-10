from pathlib import Path
import json
base=Path('experiments/mini-size-budget');maps={r['id']:r['aliases'] for r in json.loads((base/'installed.json').read_text())}
names={'future-climate-analogy':'final-interactions','pocket-fit-desk':'pockets','walk-photo-journal':'walk','illustrated-cover-shelves':'shelves','foundation-shade-desk':'foundation','masked-wrestler-index':'wrestler','artist-repetition-lab':'artist','yearbook-hair-timeline':'hair','dress-code-clothing':'dress'}
for id,name in names.items():
 s=Path(f'experiments/mini-1600-audit/tools/check-{name}.cjs').read_text()
 if id=='future-climate-analogy':
  a=s.index("await p.goto('http://localhost:41991/formal/build-interaction/samples/general/lawn-path/");b=s.index('assert.deepEqual(errors,[]);await p.close()}',a)
  s=s[:a]+s[b:];s=s.replace('PASS final three interactions normal/reduced','PASS climate normal/reduced')
 for a,b in maps[id].items():s=s.replace(a,b)
 if 'interaction' in maps[id]:s=s.replace('build-'+maps[id]['interaction'],'build-interaction')
 s=s.replace('experiments/mini-1600-audit/','experiments/mini-size-budget/regression/')
 p=base/'regression'/f'check-{id}.cjs';p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s)
