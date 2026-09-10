from pathlib import Path
import json,subprocess
root=Path(__file__).resolve().parents[3];rows=json.loads((root/'experiments/pudding-samples/evidence/promotion.json').read_text())['samples'];results=[]
for r in rows:
 p=root/Path(r['entry']).parent
 if not (p/'package.json').exists():continue
 dependencies=(root/'experiments/pudding-samples/review'/r['id']/'node_modules').resolve();assert dependencies.is_dir()
 node=p/'node_modules';assert not node.exists();node.symlink_to(dependencies,target_is_directory=True);(p/'.gitignore').write_text('node_modules\n')
 try:
  run=subprocess.run(['npm','run','build'],cwd=p,capture_output=True,text=True)
  (root/'experiments/pudding-samples/evidence/promotion-checks'/('build-'+r['id']+'.log')).write_text(run.stdout+run.stderr)
  results.append({'id':r['id'],'exit_code':run.returncode});print(r['id'],run.returncode,flush=True)
 finally:node.unlink()
 if run.returncode:break
(root/'experiments/pudding-samples/evidence/promotion-checks/builds.json').write_text(json.dumps(results,indent=2)+'\n')
assert len(results)==7 and all(r['exit_code']==0 for r in results)
