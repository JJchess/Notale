"""Run after npm install --prefix /tmp/notale-onion-deps paper@0.12.18 d3@7.9.0."""
from pathlib import Path
import shutil,json,hashlib,subprocess
base=Path(__file__).resolve().parents[1];src=base/'sources/onion';out=base/'review/onion-cut-lab';assets=[]
for rel in ['static/assets/letters/'+c+'.png' for c in sorted(set('ONION'))]+['static/assets/dot.png','src/utils/onion.js','src/utils/math.js']:
 p=src/rel;target=out/'assets'/p.name;shutil.copyfile(p,target)
 if p.suffix=='.js':target.write_text(target.read_text().replace('from "d3"','from "./d3-bridge.js"'))
 assets.append(dict(source=rel,file='assets/'+p.name,sha256=hashlib.sha256(target.read_bytes()).hexdigest(),source_sha256=hashlib.sha256(p.read_bytes()).hexdigest(),bytes=target.stat().st_size))
(out/'assets/d3-bridge.js').write_text('export const {deviation,format,mean,scaleLinear} = window.d3;\n')
for name,file,license,version in [('d3','d3.min.js','LICENSE','7.9.0'),('paper','paper-full.min.js','LICENSE.txt','0.12.18')]:
 module=Path('/tmp/notale-onion-deps/node_modules')/name
 shutil.copyfile(module/license,out/f'LICENSE.{name}');target=out/'assets'/file;shutil.copyfile(module/'dist'/file,target)
 assets.append(dict(source=f'npm:{name}@{version}/dist/{file}',file='assets/'+file,sha256=hashlib.sha256(target.read_bytes()).hexdigest(),bytes=target.stat().st_size))
shutil.copyfile(src/'LICENSE',out/'LICENSE.source')
commit=subprocess.check_output(['git','-C',str(src),'rev-parse','HEAD'],text=True).strip()
inputs=[dict(source=str(p.relative_to(src)),sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in [src/'src/components/onion/Onion.Demo.svelte',src/'src/components/onion/Onion.PieceAnalyzer.svelte',src/'src/components/onion/Onion.Piece.svelte']]
(out/'assets.json').write_text(json.dumps(dict(repo='https://github.com/the-pudding/onion',commit=commit,assets=assets,sourceInputs=inputs,adaptation='Only d3 import path changed in onion.js and math.js; PNGs byte-identical. Native SVG/Paper.js mathematical geometry retained; no raster replacements.'),indent=2)+'\n')
