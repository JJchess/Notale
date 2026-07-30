"""延迟 benchmark（Phase 2 交付物）：每模型 × {slow=开思考, fast=关思考+旋钮全开} × 15 页，
测总墙钟 + token + 确定性门 + "fast vs slow" 去偏成对质量Δ，产出"时间×质量"对照表让用户定档。

用法：
  uv run python scripts/bench_latency.py                 # 全 5 模型 × 2 变体 × 1 样本 × 15 页
  uv run python scripts/bench_latency.py --models glm_5_2 deepseek_v4_pro
  uv run python scripts/bench_latency.py --no-judge      # 只测时间/门，不调 Gemini 质量比

产物：results/bench_<ts>/{bench.md, bench.json, <model>/<variant>/deck.json+run.log}
"""

from __future__ import annotations

import argparse
import asyncio
import json
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from hydra.utils import instantiate
from lecture_agent.domain.evaluation import compare, gate
from lecture_agent.engine import GeneratorOptions, generate_lecture
from lecture_agent.utils.seed import seed_everything
from omegaconf import OmegaConf
from run_matrix import (
    CONFIG_DIR,
    MODELS,
    SEED,
    audience_of,
    build_llm,
    load_env,
    run_logger,
    usage_of,
)

ROOT = Path(__file__).resolve().parent.parent
TOPIC = "树（数据结构）"
PAGES = 15
TARGET_MIN = 5.0
FAST_GEN = OmegaConf.to_container(OmegaConf.load(ROOT / "configs" / "generator" / "fast.yaml"))


def build_fast_llm(config_name: str) -> Any:
    """同 build_llm，但把该模型 yaml 自带的 fast_extra_body（关思考参数）注入 inner.extra_body。"""
    node = OmegaConf.load(CONFIG_DIR / f"{config_name}.yaml")
    fb = node.pop("fast_extra_body", {})  # type: ignore[union-attr]
    node.inner.extra_body = fb  # type: ignore[union-attr]
    cfg = OmegaConf.create({"seed": SEED, "llm": node})
    OmegaConf.resolve(cfg)
    return instantiate(cfg.llm)


async def one(display: str, cfg_name: str, variant: str, out: Path) -> dict:
    run_dir = out / cfg_name / variant
    run_dir.mkdir(parents=True, exist_ok=True)
    logger = run_logger(f"bench.{cfg_name}.{variant}", run_dir / "run.log")
    if variant == "fast":
        llm = build_fast_llm(cfg_name)
        opts = GeneratorOptions(**FAST_GEN)
    else:
        llm = build_llm(cfg_name)
        opts = GeneratorOptions()  # 现状 full：视角3 / 并发4 / 有章节 / 开思考
    logger.info(f"=== {display} | {variant} | {PAGES}页 | opts={opts} ===")
    seed_everything(SEED)
    rec: dict[str, Any] = {"model": display, "config": cfg_name, "variant": variant}
    t0 = time.perf_counter()
    try:
        res = await generate_lecture(
            llm, topic=TOPIC, pages=PAGES, audience=audience_of(TOPIC), options=opts, log=logger.info
        )
        dt = round(time.perf_counter() - t0, 1)
        doc = res.doc
        g = gate(doc, topic=TOPIC, target_pages=PAGES)
        u = usage_of(llm)
        rec.update(
            {
                "ok": True,
                "elapsed_s": dt,
                "minutes": round(dt / 60, 1),
                "under_target": dt <= TARGET_MIN * 60,
                "pages": len(doc.get("scenes", [])),
                "errors": len(res.errors),
                "gate_pass": g["pass"],
                "gate_issues": len(g["truncation"]) + len(g["hero_offtopic"]),
                "total_tokens": u.get("total_tokens", 0),
                "reasoning_tokens": u.get("reasoning_tokens", 0),
            }
        )
        (run_dir / "deck.json").write_text(
            json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        logger.info(f"✓ {dt}s ({rec['minutes']}min) / {rec['pages']}页 / reason_tok {rec['reasoning_tokens']}")
    except Exception as e:  # noqa: BLE001
        rec.update({"ok": False, "elapsed_s": round(time.perf_counter() - t0, 1), "exception": f"{type(e).__name__}: {e}"})
        logger.exception("✗ 失败")
    (run_dir / "result.json").write_text(json.dumps(rec, ensure_ascii=False, indent=2), encoding="utf-8")
    return rec


async def model_worker(display: str, cfg_name: str, out: Path) -> list[dict]:
    """单模型：slow 再 fast，串行（保护单模型限流）。"""
    return [await one(display, cfg_name, v, out) for v in ("slow", "fast")]


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", nargs="*", default=[c for _, c in MODELS])
    ap.add_argument("--no-judge", action="store_true")
    args = ap.parse_args()
    load_env()
    picked = [(d, c) for d, c in MODELS if c in args.models]

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out = ROOT / "experiments" / "results" / f"bench_{ts}"
    out.mkdir(parents=True, exist_ok=True)
    print(f"→ {out.name}: {len(picked)} 模型 × (slow|fast) × {PAGES}页，目标 ≤{TARGET_MIN}min")

    per = await asyncio.gather(*(model_worker(d, c, out) for d, c in picked))
    recs = [r for sub in per for r in sub]

    # fast vs slow 质量Δ（同模型两版成对，Gemini 去偏）
    quality: dict[str, str] = {}
    if not args.no_judge:
        judge = build_llm("judge_gemini", namespace="judge_gemini")
        print("→ 质量对比 fast vs slow（Gemini 成对）...")
        for _d, c in picked:
            fp, sp = out / c / "fast" / "deck.json", out / c / "slow" / "deck.json"
            if fp.exists() and sp.exists():
                r = await compare(
                    judge, json.loads(fp.read_text("utf-8")), json.loads(sp.read_text("utf-8")),
                    topic=TOPIC, audience=audience_of(TOPIC),
                )
                quality[c] = {"A": "fast 更好", "B": "slow 更好", "tie": "打平"}[r["winner"]]

    _write(out, recs, quality, ts)
    print(f"✓ 对照表 → {out / 'bench.md'}")


def _write(out: Path, recs: list[dict], quality: dict[str, str], ts: str) -> None:
    (out / "bench.json").write_text(
        json.dumps({"ts": ts, "topic": TOPIC, "pages": PAGES, "runs": recs, "quality_fast_vs_slow": quality},
                   ensure_ascii=False, indent=2), encoding="utf-8")
    L = [f"# 延迟 benchmark · {ts}\n", f"课题：{TOPIC} ｜ {PAGES} 页 ｜ 目标 ≤{TARGET_MIN}min ｜ fast=关思考+视角1+并发8+无章节\n"]
    L.append("| 模型 | 变体 | 分钟 | ≤5min | 页 | 门 | 推理token | 总token |")
    L.append("|---|---|--:|:--:|--:|:--:|--:|--:|")
    by: dict[str, dict[str, dict]] = {}
    for r in recs:
        by.setdefault(r["config"], {})[r["variant"]] = r
        if r.get("ok"):
            L.append(f"| {r['model']} | {r['variant']} | {r['minutes']} | {'✓' if r['under_target'] else '✗'} | "
                     f"{r['pages']} | {'✓' if r['gate_pass'] else '✗'} | {r['reasoning_tokens']} | {r['total_tokens']} |")
        else:
            L.append(f"| {r['model']} | {r['variant']} | — | — | — | — | — | ✗{r.get('exception','')[:30]} |")
    L.append("\n## 提速比 + 质量Δ（fast vs slow，同模型）\n")
    L.append("| 模型 | slow分钟 | fast分钟 | 提速 | fast是否达标 | 质量(Gemini成对) |")
    L.append("|---|--:|--:|--:|:--:|---|")
    for c, vs in by.items():
        s, f = vs.get("slow", {}), vs.get("fast", {})
        if s.get("ok") and f.get("ok"):
            sp = f"{s['minutes']/f['minutes']:.1f}×" if f["minutes"] else "-"
            L.append(f"| {s['model']} | {s['minutes']} | {f['minutes']} | {sp} | "
                     f"{'✓达标' if f['under_target'] else '✗超时'} | {quality.get(c,'(未评)')} |")
    (out / "bench.md").write_text("\n".join(L) + "\n", encoding="utf-8")


if __name__ == "__main__":
    asyncio.run(main())
