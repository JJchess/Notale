from pathlib import Path
import subprocess,shutil,json,hashlib
out=Path(__file__).resolve().parents[1]/'review/crokinole-shot-lab'
subprocess.run(['npm','run','build'],cwd=out,check=True)
prior=out/'build-manifest.json'
if prior.exists():
 for item in json.loads(prior.read_text()):
  p=out/item['file']
  if p.parent==out/'assets' and p.name.startswith('index') and p.suffix in ['.js','.css'] and p.exists():p.unlink()
shutil.copyfile(out/'build/index.dev.html',out/'index.html')
shutil.copytree(out/'build/assets',out/'assets',dirs_exist_ok=True)
files=[p for p in (out/'build').rglob('*') if p.is_file()]
prior.write_text(json.dumps([dict(file='index.html' if p.name=='index.dev.html' else str(p.relative_to(out/'build')),sha256=hashlib.sha256(p.read_bytes()).hexdigest(),bytes=p.stat().st_size) for p in files],indent=2)+'\n')
