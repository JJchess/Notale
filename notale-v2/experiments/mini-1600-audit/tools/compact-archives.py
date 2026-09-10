from pathlib import Path
import json,shutil
styles={
'jersey-edition-board':'''\n/* Team selection stays beside the jersey editions and locally scrolling league table. */
@media(min-width:1200px) and (min-height:700px){
 header{height:56px;padding:20px 36px}main{height:844px;max-width:1600px;display:grid;grid-template-columns:300px minmax(0,1fr);grid-template-rows:minmax(0,1fr) 44px;gap:20px;padding:24px 36px}
 .intro{grid-column:1;grid-row:1;display:flex;flex-direction:column;gap:32px;justify-content:space-between;margin:0;padding:24px;border-width:2px}h1{font-size:48px}.intro .lead{font-size:20px!important}.intro label{margin-top:24px}
 .board{grid-column:2;grid-row:1;min-height:0;padding:20px 24px;display:flex;flex-direction:column}#wardrobe{gap:12px;margin:18px 0 10px}#wardrobe img{height:130px;margin-bottom:8px}#wardrobe span{font-size:22px}.hint{margin:10px 0 14px}.table-scroll{min-height:0;flex:1;overscroll-behavior:contain;scrollbar-gutter:stable}thead{position:sticky;top:0;background:#fffaf2;z-index:1}.footnote{margin:12px 0 0}
 footer{grid-column:1/-1;grid-row:2;margin:0;padding:14px 20px}
}
''',
'banknote-firsts':'''\n/* A three-part slide: banknote carousel, complete record list, selected biography. */
@media(min-width:1200px) and (min-height:700px){
 main{height:900px;max-width:1600px;display:grid;grid-template-columns:320px minmax(0,1fr) 270px;grid-template-rows:28px minmax(0,1fr) 66px;gap:24px;padding:24px 36px}header{grid-column:1/-1}
 .opening{grid-column:1;grid-row:2;display:flex;flex-direction:column;align-items:stretch;justify-content:space-between;gap:16px;margin:0}h1{font-size:38px;margin:14px 0}.intro{font-size:16px;line-height:1.7}.scope{font-size:12px}.bill{width:100%;max-width:none}.bill img{height:150px;max-height:150px}.bill-label{margin:0 0 8px}figcaption{font-size:16px;min-height:65px;margin:12px 0}.bill nav{gap:16px}
 .explorer{display:contents}.chart-wrap{grid-column:2;grid-row:2;min-height:0;display:flex;flex-direction:column}.filters{margin:16px 0 6px}.filters input{width:160px}#chart{min-height:0;flex:1;overflow:auto;overscroll-behavior:contain;scrollbar-gutter:stable;padding-right:8px}.cell{height:28px}.row{margin-bottom:3px}
 #profile{grid-column:3;grid-row:2;position:static;min-height:0;padding-top:24px;overflow:auto;overscroll-behavior:contain}.profile-text{box-shadow:0 8px 10px #0002}.hint{margin-top:20px}
 footer{grid-column:1/-1;grid-row:3;margin:0;padding:12px 0 0;gap:8px 20px;font-size:11px}
}
'''}
p=Path('workflows/build-page/samples/catalog.json');d=json.loads(p.read_text())
for sid,css in styles.items():
 r=next(x for x in d['samples'] if x['id']==sid);src=p.parent.parent/r['full']['root'];dst=src.parent/'mini/pages';assert not dst.exists();shutil.copytree(src,dst)
 for name in ['index.html','SAMPLE.md']:
  f=dst/name;f.write_text(f.read_text().replace('../../../../../index.html','../../../../../../index.html').replace('../provenance/','../../provenance/'))
 with (dst/'style.css').open('a') as f:f.write(css)
 spec=json.loads(json.dumps(r['full']));spec['root']=str(dst.relative_to(p.parent.parent));spec['omitted']={k.replace('../../../../../index.html','../../../../../../index.html'):v for k,v in spec['omitted'].items()};spec['chars']=sum(len((dst/f).read_text()) for f in spec['files']);r['mini']=spec
p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
