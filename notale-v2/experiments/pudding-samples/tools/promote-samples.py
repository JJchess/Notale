"""Install the 29 user-approved samples without altering their media or model logic."""
from pathlib import Path
import json, shutil, re, os, hashlib
ROOT=Path(__file__).resolve().parents[3]
RESEARCH=ROOT/'experiments/pudding-samples'
CONFIG={
'wine-bottle-choice':('page/general','A stable object lineup uses original rotation frames, focus, and reveal to expose category evidence.'),
'waistline-cohorts':('page/chart','Stable image identities and percentile interpolation expose how overlapping cohorts occupy a shared scale.'),
'brand-size-atlas':('page/chart','Aligned intervals and a common measurement axis reveal disagreement among category labels.'),
'menu-reading-room':('page/general','Original scans move from a spatial collection into a readable zoom-and-pan inspection surface.'),
'wine-animal-rankings':('page/chart','Original object images retain identity while metric-driven ordering changes on a shared ranking field.'),
'onion-cut-lab':('interaction/general','Changing cut geometry recomputes piece areas and dispersion; the exploded pieces explain the resulting distribution.'),
'walk-photo-journal':('page/general','A persistent route joins dated photographs and videos to their geographic and narrative positions.'),
'illustrated-cover-shelves':('page/chart','A common image-shelf grammar links individual covers, yearly cohorts, and aggregate proportions.'),
'crokinole-shot-lab':('interaction/general','Position, angle, and power controls or hold-to-charge set up a shot; collisions, legal settlement, scoring, and reset derive from one physics state.'),
'flipbook-branches':('page/general','Synchronized image sequences expose divergent branches through a shared frame index and stable panels.'),
'pocket-fit-desk':('interaction/general','Selecting a known-size object compares its dimensions with pocket openings and precomputed fitting rectangles, then highlights the fit evidence.'),
'jersey-edition-board':('page/chart','Original uniform images act as stable category keys for game counts and edition comparisons.'),
'iconography-lens':('page/general','Registered masks reveal overlapping motifs without moving the underlying original image or its landmarks.'),
'dog-flow-atlas':('page/chart','Paired geographic flows use a shared breed identity and count encoding to compare inbound and outbound movement.'),
'pantheon-index':('page/general','A dense original sprite index links compact visual identities to detailed illustrations and related records.'),
'music-sample-pair':('page/general','Paired original recordings, waveform regions, and sequential playback make a source-to-derivative correspondence inspectable.'),
'population-clock':('page/chart','A shared time state maps real observations into alternative geographic and population encodings.'),
'state-maze-stories':('interaction/general','Keyboard or touch moves along legal maze cells; visited paths, completion, and saved progress derive from the same grid.'),
'banknote-firsts':('page/chart','Original portraits and banknote images form a chronological index with explicit missing-image states and gender comparisons.'),
'foundation-shade-desk':('page/chart','Common histogram bins and count-driven opacity reveal distribution differences across paired product ranges.'),
'masked-wrestler-index':('page/general','A sprite atlas preserves individual identities across an animated pixel reveal, an index, and linked biographies.'),
'artist-repetition-lab':('page/chart','Individual song points and a shared reference distribution connect within-group variation to a population baseline.'),
'crossword-representation':('interaction/general','Letter entry updates a constrained grid, crossing words, validation, undo history, and completion evidence.'),
'yearbook-hair-timeline':('page/chart','Original image cohorts remain registered to a shared time series, connecting aggregate measurements to visual evidence.'),
'photo-history-quiz':('interaction/general','A committed date estimate generates an error against the true year and a comparison with recorded reader distributions.'),
'dress-code-clothing':('page/chart','Stable grouped labels use authored highlighting and original counts to separate prevalence from category composition.'),
'waveform-air-lab':('interaction/general','Amplitude, frequency, and phase drive one waveform model, particle displacement, and the corresponding audible oscillator.'),
'coin-flip-wealth':('interaction/general','Each outcome transfers a wager based on the poorer balance; conservation, changing wealth order, and trajectories share one state.'),
'grandmas-kimchi-kitchen':('interaction/general','Collecting required objects changes a persistent completion set, gates the next scene, and preserves spatial narrative clues.'),
}
BUILT={'crokinole-shot-lab':'src/main.js','state-maze-stories':'src/main.js','artist-repetition-lab':'src/main.js','crossword-representation':'src/main.js','waveform-air-lab':'main.jsx','coin-flip-wealth':'main.js','grandmas-kimchi-kitchen':'main.js'}
TEXT_EXT={'.html','.js','.jsx','.mjs','.svelte','.css','.json','.csv'}
IMPORT=re.compile(r'''(?:from\s*|import\s*\(?|require\s*\()\s*["']([.$][^"']+)["']''')
def source_graph(p, entry):
 seen=set()
 def visit(f):
  if not f.is_file() or f in seen or f.suffix not in TEXT_EXT:return
  seen.add(f)
  for dep in IMPORT.findall(f.read_text()) + re.findall(r'''@import\s+(?:url\()?['"]([^'"]+)['"]''', f.read_text()):
   q=f.parent/dep
   if dep.startswith("$"):
    name,_,rest=dep[1:].partition("/")
    q=p/"src"/(rest+".js" if name=="app" else name+"/"+rest)
   candidates=[q]+[Path(str(q)+ext) for ext in ['.js','.jsx','.svelte','.css']]+[q/'index.js',q/'index.jsx']
   for t in candidates:
    if t.is_file():visit(t.resolve());break
 visit((p/entry).resolve())
 return sorted(f.relative_to(p.resolve()).as_posix() for f in seen)
def spec_for(p,id):
 files=['index.html']
 if id in BUILT:files+=source_graph(p,BUILT[id])
 else:
  files += [f.name for f in p.iterdir() if f.is_file() and f.suffix in {'.js','.css'}]
 for f in p.glob('*.css'):
  if f.name not in files:files.append(f.name)
 # The crossword component owns the mechanism promised by this Main sample.
 if id=='crossword-representation':
  files+=['vendor/svelte-crossword/README.md','vendor/svelte-crossword/LICENSE']
  files+=source_graph(p,'vendor/svelte-crossword/src/Crossword.svelte')
 # These are the original authored renderers, not vendor frameworks.
 for rel in {'foundation-shade-desk':['vendor/brawl.js'],'yearbook-hair-timeline':['vendor/line.js'],'masked-wrestler-index':['vendor/prepare-transition.js','vendor/move.js']}.get(id,[]):
  if (p/rel).is_file() and rel not in files:files.append(rel)
 files=list(dict.fromkeys(files));text=(p/'index.html').read_text();omitted={}
 for ref in sorted(set(re.findall(r'(?:src|href)="([^"#?]+)"',text))):
  ref=ref.removeprefix('./')
  if ref.startswith(('http:','https:','data:','//')) or ref in files:continue
  if ref.endswith('SAMPLE.md'):note='Local source attribution and approval record; not part of the rendering algorithm.'
  elif ref.endswith('index.html') and ref.startswith('../'):note='Navigation back to the formal sample gallery.'
  elif ref.endswith(('.js','.css')):note='Locally shipped runtime build or library dependency; readable author components and styles are included in this bundle.'
  else:note='Original local media or dataset retained byte-for-byte in the runnable sample; see its source manifest.'
  omitted[ref]=note
 return {'root':p.relative_to(p.parents[4]).as_posix(),'chars':sum(len((p/f).read_text()) for f in files),'files':files,**({'omitted':omitted} if omitted else {})}
def main():
 catalog=json.loads((RESEARCH/'catalog.json').read_text());assert set(CONFIG)=={r['id'] for r in catalog['candidates']}
 report=[]; catalogs={}
 for row in catalog['candidates']:
  id=row['id'];kind,pattern=CONFIG[id];workflow,category=kind.split('/');skill=ROOT/'workflows'/('build-'+workflow);dest=skill/'samples'/category/id;pages=dest/'pages';source=RESEARCH/Path(row['entry']).parent
  if dest.exists():raise RuntimeError('Refusing to overwrite '+str(dest))
  shutil.copytree(source,pages,ignore=shutil.ignore_patterns('node_modules','shots','.gitignore'))
  # Preserve research records separately from model-readable implementation.
  meta=dest/'provenance';meta.mkdir()
  for f in list(pages.iterdir()):
   if f.name in {'REVIEW.md','assets.json','upstream'} or f.name.startswith(('LICENSE','SOURCE-NOTICE','THIRD-PARTY')) or f.name.endswith('LICENSE') or f.name=='vendor-licenses':shutil.move(str(f),meta/f.name)
  # Only navigation/status copy changes. Data, raster/audio/video and rendering logic stay intact.
  modified=[]
  for f in pages.rglob('*'):
   if not f.is_file() or f.suffix not in TEXT_EXT:continue
   if any(t in f.parts for t in ['vendor']):continue
   old=f.read_text();new=old
   for before,after in [('href="../../index.html"','href="../../../../../index.html" target="_top"'),('href="../../"','href="../../../../../index.html" target="_top"'),('"href","../../"','"href","../../../../../index.html"'),('"href","../../index.html"','"href","../../../../../index.html"'),('REVIEW.md','SAMPLE.md'),('Sample 备选库','Samples'),('Sample 候选库','Samples'),('备选库','Samples'),(' · Candidate',' · Sample'),('A local candidate awaiting review.','An approved local sample.'),('A local candidate awaiting your review.','An approved local sample.')]:new=new.replace(before,after)
   if new!=old:f.write_text(new);modified.append(f.relative_to(pages).as_posix())
  (pages/'SAMPLE.md').write_text(f'# {row["title"]}\n\nApproved by the user on 2026-09-07. Formal category: `{kind}`.\n\n{pattern}\n\nSource: {row["repo"]}, commit `{row["commit"]}`.\n\nOriginal media, fonts, data and implementation are retained locally. [Original review](../provenance/REVIEW.md) · [Asset manifest](../provenance/assets.json). Manifest paths are relative to the original candidate; unchanged runtime assets remain under pages/, archived originals under provenance/.\n\nThis is a scoped, runnable sample extracted from the original work, not the complete original article. Framework samples include their compiled browser build and editable author source. Serve this directory over HTTP.\n')
  # Build an immutable asset comparison across the move, including every runtime file.
  compared=0
  for f in source.rglob('*'):
   if not f.is_file() or any(part in {'node_modules','shots','upstream'} for part in f.relative_to(source).parts):continue
   rel=f.relative_to(source);target=pages/rel
   if target.is_file() and rel.as_posix() not in modified:
    assert hashlib.sha256(f.read_bytes()).digest()==hashlib.sha256(target.read_bytes()).digest(),str(rel);compared+=1
  spec=spec_for(pages,id);spec['root']=pages.relative_to(skill).as_posix()
  item={'id':id,'category':category,'main':True,'aux':False,'full':spec,'source':{'repo':row['repo'],'commit':row['commit'],'approved':'2026-09-07','candidate_id':id},'pattern':pattern,'shots':[{'label':'Initial view','wait':2000}]}
  cf=skill/'samples/catalog.json'
  if cf not in catalogs:catalogs[cf]=json.loads(cf.read_text())
  assert id not in {r['id'] for r in catalogs[cf]['samples']};catalogs[cf]['samples'].append(item)
  report.append({'id':id,'title':row['title'],'category':kind,'entry':(pages/'index.html').relative_to(ROOT).as_posix(),'sample_dir':dest.relative_to(ROOT).as_posix(),'source_chars':spec['chars'],'unchanged_files':compared,'navigation_changes':modified})
 for f,d in catalogs.items():f.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
 for workflow in ['page','interaction']:
  f=ROOT/'workflows'/('build-'+workflow)/'SKILL.md';s=f.read_text()
  for category in ['general','chart']:
   rows=[r for r in report if r['category']==workflow+'/'+category]
   if not rows:continue
   marker='### '+category+'\n';start=s.index(marker)+len(marker);nexts=[x for x in [s.find('\n### ',start),s.find('\nFollow the selected reference',start)] if x>=0];end=min(nexts)
   additions='\n'+''.join(f'\n- `{r["id"]}`\n  - {CONFIG[r["id"]][1]}\n  `<skill-dir>/samples/bundles/{category}/{r["id"]}.full.md`\n' for r in rows)
   s=s[:end]+additions+s[end:]
  f.write_text(s)
 (RESEARCH/'evidence/promotion.json').write_text(json.dumps({'approved':'2026-09-07','samples':report},ensure_ascii=False,indent=2)+'\n')
 print('Installed',len(report),'samples; source chars:',sum(r['source_chars'] for r in report));print('\n'.join(f'{r["category"]}: {r["id"]} ({r["source_chars"]})' for r in report))
if __name__=='__main__':main()
