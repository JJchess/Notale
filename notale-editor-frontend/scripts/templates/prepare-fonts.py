"""Package complete Chinese coverage as WOFF2; editing new text must not miss glyphs."""
from fontTools.ttLib import TTFont
from pathlib import Path
import brotli
_compress=brotli.compress
brotli.compress=lambda data, **kwargs: _compress(data, **{**kwargs,"quality":5})
root=Path(__file__).resolve().parents[3]/'refs/template/organized/_shared/fonts'
out=Path(__file__).resolve().parents[2]/'templates/refined/assets'
out.mkdir(parents=True,exist_ok=True)
for name in ['NotaleCJK-Regular.otf','NotaleCJK-Bold.otf','NotaleDroid.ttf','NotaleZenHei.ttc']:
 target=out/(Path(name).stem+'.woff2')
 if target.exists():continue
 font=TTFont(root/name,fontNumber=0);font.flavor='woff2';font.save(target)
 print(target.name, target.stat().st_size,flush=True)
