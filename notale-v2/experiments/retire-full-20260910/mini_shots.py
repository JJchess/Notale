"""Move historical full contact sheets to the archive; register mini controls."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def shot(label, after, wait=1000):
    return {"label": label, "after": after, "wait": wait}


updates = {
    "escapement": [shot(label, f'document.querySelector(\'[data-index="{i}"]\').click()')
                   for i, label in [(1, "放开"), (2, "走一齿"), (3, "再锁住")]],
    "lenna-image-lineage": [shot("图像对应", "document.querySelector('#next').click()"),
                           shot("后续状态", "document.querySelector('#next').click();document.querySelector('#next').click()")],
    "neuron-to-formula": [shot(label, "document.querySelector('#next').click()")
                          for label in ["加权输入", "求和与激活", "输出"]],
    "rain-paths": [shot("湿地表面", "document.querySelectorAll('.surface')[2].click()"),
                   shot("复位", "document.querySelector('.close').click();document.querySelector('.reset').click()")],
    "climate-zone-shift-map": [shot("未来分区", 'document.querySelector(\'[data-year="future"]\').click()'),
                               shot("复位", "document.querySelector('#reset').click()")],
    "lenna-scroll-bars": [shot("下一状态", "document.querySelector('#next').click()"),
                          shot("后续状态", "document.querySelector('#next').click()")],
    "pollinator-network": [shot("桥接证据", "document.querySelector('#bridge').click()"),
                           shot("完整网络", "document.querySelector('#full').click()")],
    "solar-storage": [shot("重演转移", "document.querySelector('#replay').click()")],
    "gimbal": [shot("重新演算", "document.querySelector('#reset').click()", 2200)],
    "population-mountains": [shot("侧看峰值", 'document.querySelector(\'[data-view="profile"]\').click()'),
                             shot("俯视分布", 'document.querySelector(\'[data-view="top"]\').click()')],
    "lawn-path": [shot("路线推进", '["ArrowRight","ArrowRight","ArrowDown"].forEach(k=>document.querySelector(\'[data-key="\'+k+\'"]\').click())'),
                  shot("重置", 'document.querySelector(\'[data-action="reset"]\').click()')],
    "coin-flip-wealth": [shot("逐轮账本", "for(let i=0;i<10;i++)document.querySelector('.U').click()")],
    "grandmas-kimchi-kitchen": [shot("海报", 'document.querySelector(\'.C[image="poster1.png"]\').click()')],
}

for catalog in (ROOT / "workflows").glob("build-*/samples/catalog.json"):
    data = json.loads(catalog.read_text())
    for row in data["samples"]:
        if "mini" not in row:
            continue
        if row["id"] in updates:
            row["shots"] = [{"label": "初态", "wait": 1200}, *updates[row["id"]]]
        source = catalog.parent / row["category"] / row["id"]
        dest = ROOT / "legacy/full-samples/workflows" / source.relative_to(ROOT / "workflows")
        dest.mkdir(parents=True, exist_ok=True)
        for name in ("shots", "shots.png"):
            p = source / name
            if p.exists():
                assert not (dest / name).exists(), dest / name
                p.rename(dest / name)
    catalog.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
print("Archived previous contact sheets; registered mini authored states.")
