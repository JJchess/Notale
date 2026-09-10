"""Build the review gallery from registered mini variants; no runtime fallback."""
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
WORKFLOWS = ROOT / 'workflows'
recent = {r['id'] for r in json.loads((ROOT / 'experiments/mini-completion-20260908/progress.json').read_text())}
promoted = {r['id'] for r in json.loads((ROOT / 'experiments/pudding-samples/catalog.json').read_text())['candidates'] if r.get('promoted')}
existing = (WORKFLOWS / 'index.html').read_text()
style = re.search(r'<style>(.*?)</style>', existing, re.S)[1]
e = html.escape
sections = []
count = 0
for workflow, label in [('build-cover', '封面'), ('build-page', '内容页'), ('build-interaction', '交互页')]:
    rows = json.loads((WORKFLOWS / workflow / 'samples/catalog.json').read_text())['samples']
    cards = []
    for row in rows:
        if 'mini' not in row:
            continue
        sid, spec = row['id'], row['mini']
        entry = f'{workflow}/{spec["root"]}/index.html'
        source = WORKFLOWS / entry
        assert source.is_file(), source
        title = re.search(r'<title[^>]*>(.*?)</title>', source.read_text(), re.S | re.I)
        title = html.unescape(title[1].strip()) if title else sid
        bundle = f'{workflow}/samples/bundles/{row["category"]}/{sid}.mini.md'
        assert (WORKFLOWS / bundle).is_file()
        tags = (' · 刚补齐' if sid in recent else '') + (' · 本次入库' if sid in promoted else '')
        cards.append(f'''<article data-id="{e(sid)}" data-recent="{int(sid in recent)}" data-promoted="{int(sid in promoted)}"><span class="meta">{e(row['category'])} · 独立 mini{tags}</span><h3>{e(title)}</h3><p>{e(sid)}</p><p>mini {spec['chars']:,} 字符</p><div class="actions"><button data-entry="{e(entry)}" data-title="{e(title)}">预览 mini</button><a href="{e(entry)}" target="_blank" rel="noopener">独立打开 mini ↗</a><a href="{e(bundle)}" target="_blank" rel="noopener">mini 源码</a></div></article>''')
        count += 1
    sections.append(f'<section><h2>{label}<small>{len(cards)}</small></h2><div class="grid">'+''.join(cards)+'</div></section>')
page = '''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Notale · 全部 mini 验收</title><style>'''+style+'''
.filters{display:flex;gap:12px;flex-wrap:wrap;align-items:center;padding:20px 0}input,select{font:inherit;padding:10px;border:1px solid #aaa;background:white;max-width:100%}.meta{font-size:12px;color:#666}article h3{line-height:1.5}article[hidden],section[hidden]{display:none}.viewport{height:calc(100% - 52px);position:relative;background:#e6e6e6}iframe{position:absolute;left:50%;top:50%;width:1600px;height:900px;background:white;transform:translate(-50%,-50%) scale(var(--preview-scale,.5));transform-origin:center}.toolbar select{padding:4px;max-width:120px}@media(max-width:600px){.toolbar strong{display:none}.toolbar{gap:6px}.toolbar a{font-size:12px}}
</style><main><header><span>NOTALE / MINI REVIEW</span><h1>全部 mini · '''+str(count)+''' 个</h1><p>按正式 catalog 的独立 mini 路径运行。可独立打开或嵌入预览。</p><a href="index.html">返回 29 个正式样本画廊</a></header><div class="filters"><label>范围 <select id="scope"><option value="all">全部 51 个</option><option value="promoted">本次入库 29 个</option><option value="recent">刚补齐 18 个</option></select></label><label>搜索 <input id="search" type="search" placeholder="名称或样本 ID"></label><output id="count" aria-live="polite"></output></div>'''+''.join(sections)+'''<footer>关闭预览会卸载样本，停止该页面的动画与音频。嵌入预览固定为 1600×900，并等比缩放以适应窗口。</footer></main><dialog aria-label="mini 预览"><div class="toolbar"><strong></strong><span class="meta">1600 × 900</span><a target="_blank" rel="noopener">独立打开 mini ↗</a><button>关闭</button></div><div class="viewport"><iframe allow="autoplay; fullscreen" title="mini 预览"></iframe></div></dialog><script>
const dialog=document.querySelector('dialog'),frame=dialog.querySelector('iframe');let opener;
document.querySelectorAll('[data-entry]').forEach(b=>b.addEventListener('click',()=>{opener=b;dialog.querySelector('strong').textContent=b.dataset.title;dialog.querySelector('a').href=b.dataset.entry;frame.title=b.dataset.title;frame.src=b.dataset.entry;dialog.showModal()}));
dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{frame.src='about:blank';opener?.focus()});const viewport=dialog.querySelector('.viewport');new ResizeObserver(()=>{frame.style.setProperty('--preview-scale',Math.min(viewport.clientWidth/1600,viewport.clientHeight/900))}).observe(viewport);
function filter(){let n=0;const scope=document.querySelector('#scope').value,q=document.querySelector('#search').value.trim().toLowerCase();document.querySelectorAll('article').forEach(a=>{a.hidden=!(scope==='all'||a.dataset[scope]==='1')||!a.textContent.toLowerCase().includes(q);if(!a.hidden)n++});document.querySelectorAll('section').forEach(s=>s.hidden=!s.querySelector('article:not([hidden])'));document.querySelector('#count').textContent=n+' 个样本'}document.querySelector('#scope').onchange=filter;document.querySelector('#search').oninput=filter;filter();
</script></html>'''
(WORKFLOWS / 'mini.html').write_text(page)
print(f'Wrote workflows/mini.html: {count} minis')
