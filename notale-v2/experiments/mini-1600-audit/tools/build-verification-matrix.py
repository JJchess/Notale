from pathlib import Path
import json
base=Path('experiments/mini-1600-audit')
groups={
 'foundation-checks.json':['foundation-shade-desk'],
 'three-checks.json':['music-sample-pair','flipbook-branches','onion-cut-lab'],
 'dress-checks.json':['dress-code-clothing'],
 'wrestler-checks.json':['masked-wrestler-index'],
 'pantheon-checks.json':['pantheon-index'],
 'iconography-checks.json':['iconography-lens'],
 'archives-checks.json':['jersey-edition-board','banknote-firsts'],
 'dogs-checks.json':['dog-flow-atlas'],
 'hair-checks.json':['yearbook-hair-timeline'],
 'pockets-checks.json':['pocket-fit-desk'],
 'photoquiz-checks.json':['photo-history-quiz'],
 'shelves-checks.json':['illustrated-cover-shelves'],
 'walk-checks.json':['walk-photo-journal'],
 'crokinole-checks.json':['crokinole-shot-lab'],
 'artist-checks.json':['artist-repetition-lab'],
 'crossword-checks.json':['crossword-representation'],
 'maze-all-states.json':['state-maze-stories'],
 'wave-checks.json':['waveform-air-lab'],
 'coin-checks.json':['coin-flip-wealth'],
 'kimchi-checks.json':['grandmas-kimchi-kitchen'],
 'rain-checks.json':['rain-paths'],
 'menu-checks.json':['menu-reading-room'],
 'cover-three-checks.json':['grid-to-preview','prism-light','telescope-zoom'],
 'cover-canvas-checks.json':['climate-zones-title','lenna-pixel-field'],
 'cover-generative-checks.json':['magnetic-field','mycelium-growth','tactile-grid'],
 'science-three-checks.json':['escapement','neuron-to-formula','lenna-image-lineage'],
 'chart-three-checks.json':['climate-zone-shift-map','lenna-scroll-bars','pollinator-network'],
 'solar-swarm-checks.json':['solar-storage','swarm-spectrum'],
 '3d-bounds-review.json':['gimbal','population-mountains'],
 'shared-three-checks.json':['wine-bottle-choice','waistline-cohorts','brand-size-atlas'],
 'clock-rankings-checks.json':['population-clock','wine-animal-rankings'],
 'final-interactions-checks.json':['future-climate-analogy','lawn-path','motif-match']
}
evidence={id:name for name,ids in groups.items() for id in ids if (base/name).exists()}
rows=[]
for workflow in ['build-cover','build-page','build-interaction']:
 for row in json.loads(Path(f'workflows/{workflow}/samples/catalog.json').read_text())['samples']:
  if not row.get('mini'):continue
  name=evidence.get(row['id']);rows.append({'workflow':workflow,'id':row['id'],'root':row['mini']['root'],'status':'targeted_evidence_recorded' if name else 'dynamic_review_pending','evidence':name})
(base/'verification-matrix.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
text='# 单屏验收覆盖清单\n\n所有51项均通过初态文档尺寸复扫。下表仅追踪新增单屏标准的专项交互证据，不自动等同全库最终验收；详细范围以对应记录与测试源码为准。\n\n| 样本 | 专项证据 |\n|---|---|\n'
for r in rows:text+=f"| {r['id']} | "+(f"[{r['evidence']}]({r['evidence']})" if r['evidence'] else '待补动态/终态检查')+' |\n'
(base/'VERIFICATION.md').write_text(text)
print({'total':len(rows),'withTargetedEvidence':sum(bool(r['evidence']) for r in rows),'pending':sum(not r['evidence'] for r in rows)})
