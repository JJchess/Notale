from pathlib import Path
import shutil,json,hashlib,subprocess
b=Path(__file__).resolve().parents[1];src=b/'sources/crokinole';out=b/'review/crokinole-shot-lab';assets=[]
paths=['src/utils/crokinole.js','src/data/specs.js','src/data/variables.json','src/data/scenarios.json','src/stores/misc.js','src/components/Crokinole.Bg.svelte']
for rel in paths:
 target=out/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src/rel,target)
for name in ['disc','rim','flick','hole']:
 rel=f'static/assets/audio/{name}.mp3';target=out/'assets/audio'/f'{name}.mp3';target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src/rel,target);assets.append(dict(source=rel,file=str(target.relative_to(out)),sha256=hashlib.sha256(target.read_bytes()).hexdigest(),bytes=target.stat().st_size))
# Local adapter only adds teardown, a read-only snapshot, and a relative asset base.
p=out/'src/utils/crokinole.js';s=p.read_text();s=s.replace('return {\n\t\tremoveDiscs,','return {\n\t\tdestroy() { Matter.Runner.stop(runner); Matter.Render.stop(render); Matter.Composite.clear(world, false); Matter.Engine.clear(engine); render.canvas.remove(); },\n\t\tsnapshot() { return discs.map(d => ({player:d.player,x:d.position.x,y:d.position.y,score:d.score,valid:d.valid})); },\n\t\tremoveDiscs,');p.write_text(s)
(out/'src/paths.js').write_text('export const base = ".";\n');shutil.copyfile(src/'LICENSE',out/'LICENSE.source')
manifest=dict(repo='https://github.com/the-pudding/crokinole',commit=subprocess.check_output(['git','-C',str(src),'rev-parse','HEAD'],text=True).strip(),assets=assets,sourceInputs=[dict(source=p,sha256=hashlib.sha256((src/p).read_bytes()).hexdigest(),local_sha256=hashlib.sha256((out/p).read_bytes()).hexdigest()) for p in paths],adaptation='Physical formulas unchanged; adds destroy and read-only snapshot methods. App paths alias uses relative base. Native CSS board retained.')
(out/'assets.json').write_text(json.dumps(manifest,indent=2)+'\n')
