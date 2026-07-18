"""模型对比实验机楼（matrix harness）。

在**同一题集 × 同一页数**下横向对比多个 LLM 生成讲义的表现，产出可复现的详细日志与汇总表。

设计：
- 每个模型一行 llm 配置（configs/llm/*.yaml），各自独立 fixture namespace（prompt-hash 相同也不串包）。
- 模型**并行**跑（asyncio.gather），单模型内 3 个样本**串行**（保护单模型限流、日志可读）。
- 每次 run 独立目录：deck.json（产物）/ run.log（编排逐步日志）/ result.json（该 run 全部指标）。
- 生成后用**固定评委**（DeepSeek-V4-Pro）对全部讲义做 PPTEval 三维打分，横向可比。
- 客观指标：页数 / 块数 / 丢块 / 校验错误 / 警告 / 多元度 / 结构渲染是否过 / 耗时 / token。

用法：
  uv run python scripts/run_matrix.py                 # 全量 5 模型 × 3 样本
  uv run python scripts/run_matrix.py --smoke         # 冒烟：1 模型 × 1 样本 × 4 页
  uv run python scripts/run_matrix.py --no-judge      # 跳过 LLM 评审
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from hydra.utils import instantiate
from omegaconf import OmegaConf

from lecture_agent.adapters.render.structural import StructuralVerifier
from lecture_agent.agent import GeneratorOptions, generate_lecture
from lecture_agent.domain.evaluation import diversity, evaluate_lecture
from lecture_agent.utils.seed import seed_everything

# ── 实验矩阵定义 ───────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = ROOT / "configs" / "llm"

# 显示名 → configs/llm/<file>.yaml（模型 id、namespace 在 yaml 里，单一真相源）
MODELS: list[tuple[str, str]] = [
    ("GLM-5.2", "glm_5_2"),
    ("Kimi-K2.7-Code", "kimi_k2_7_code"),
    ("Kimi-K2.6", "kimi_k2_6"),
    ("DeepSeek-V4-Pro", "deepseek_v4_pro"),
    ("DeepSeek-V4-Flash", "deepseek_v4_flash"),
]

TOPICS: list[str] = [
    "树（数据结构）",
    "遗传学定律（高中生物学）",
    "电磁感应（高中物理学）",
]

PAGES = 12
SEED = 0
JUDGE_CONFIG = "deepseek_v4_pro"  # 固定评委：DeepSeek-V4-Pro


# ── .env 加载（ws2/.env，OpenAI 兼容 key）──────────────────────────────────────
def load_env() -> None:
    import os

    for envp in (ROOT.parent / ".env", ROOT / ".env"):
        if not envp.exists():
            continue
        for line in envp.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            k, v = k.strip(), v.strip().strip('"').strip("'")
            os.environ.setdefault(k, v)


def slug(s: str) -> str:
    return re.sub(r"[^0-9A-Za-z一-鿿]+", "_", s).strip("_")[:40]


def build_llm(config_name: str, *, namespace: str | None = None) -> Any:
    """从 configs/llm/<config_name>.yaml 构造 CassetteClient（解析 ${seed}）。"""
    node = OmegaConf.load(CONFIG_DIR / f"{config_name}.yaml")
    if namespace is not None:
        node["namespace"] = namespace
    cfg = OmegaConf.create({"seed": SEED, "llm": node})
    OmegaConf.resolve(cfg)
    return instantiate(cfg.llm)


def run_logger(name: str, logfile: Path) -> logging.Logger:
    """每 run 独立 logger + FileHandler（utf-8），同时回显到控制台。"""
    logger = logging.getLogger(name)
    logger.handlers.clear()
    logger.setLevel(logging.INFO)
    logger.propagate = False
    fmt = logging.Formatter("%(asctime)s | %(message)s", datefmt="%H:%M:%S")
    fh = logging.FileHandler(logfile, encoding="utf-8")
    fh.setFormatter(fmt)
    logger.addHandler(fh)
    return logger


def usage_of(llm: Any) -> dict[str, int]:
    inner = getattr(llm, "inner", None)
    u = getattr(inner, "usage", None)
    return dict(u) if u else {}


# ── 单次生成 ───────────────────────────────────────────────────────────────────
async def one_run(display: str, config_name: str, topic: str, run_dir: Path, pages: int) -> dict:
    run_dir.mkdir(parents=True, exist_ok=True)
    logger = run_logger(f"matrix.{config_name}.{slug(topic)}", run_dir / "run.log")
    logger.info(f"=== {display} | {topic} | {pages} 页 ===")

    seed_everything(SEED)
    llm = build_llm(config_name)
    rec: dict[str, Any] = {
        "model": display,
        "config": config_name,
        "topic": topic,
        "pages_target": pages,
    }
    t0 = time.perf_counter()
    try:
        result = await generate_lecture(
            llm,
            topic=topic,
            pages=pages,
            options=GeneratorOptions(),  # full：fan-out + revise + 3 视角
            log=logger.info,
        )
        elapsed = round(time.perf_counter() - t0, 1)
        doc = result.doc
        report = await StructuralVerifier().verify(json.dumps(doc, ensure_ascii=False))
        scenes = doc.get("scenes", [])
        blocks = sum(len(s.get("blocks") or []) for s in scenes)
        rec.update(
            {
                "ok": True,
                "pages": len(scenes),
                "blocks": blocks,
                "dropped": len(result.dropped),
                "errors": len(result.errors),
                "warnings": len(result.warnings),
                "perspectives": len(result.perspectives),
                "structural_ok": report.ok,
                "structural_errors": len(report.errors),
                "elapsed_s": elapsed,
                "usage": usage_of(llm),
                "error_samples": result.errors[:3],
            }
        )
        (run_dir / "deck.json").write_text(
            json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        logger.info(
            f"✓ 完成 {len(scenes)} 页 / {blocks} 块 / 丢 {len(result.dropped)} / "
            f"错 {len(result.errors)} / {elapsed}s / tok {rec['usage'].get('total_tokens')}"
        )
    except Exception as e:  # noqa: BLE001 —— 单模型失败不拖垮整矩阵
        rec.update(
            {
                "ok": False,
                "elapsed_s": round(time.perf_counter() - t0, 1),
                "exception": f"{type(e).__name__}: {e}",
                "usage": usage_of(llm),
            }
        )
        logger.exception("✗ 生成失败")
    (run_dir / "result.json").write_text(
        json.dumps(rec, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return rec


async def model_worker(display: str, config_name: str, out: Path, pages: int, topics: list[str]) -> list[dict]:
    """单模型：3 样本串行（同一模型内不并发，保护限流）。"""
    recs = []
    for topic in topics:
        run_dir = out / config_name / slug(topic)
        recs.append(await one_run(display, config_name, topic, run_dir, pages))
    return recs


# ── 评审（固定评委横评）─────────────────────────────────────────────────────────
async def judge_all(records: list[dict], out: Path) -> None:
    judge = build_llm(JUDGE_CONFIG, namespace="judge")
    sem = asyncio.Semaphore(3)

    async def score(rec: dict) -> None:
        if not rec.get("ok"):
            rec["judge"] = None
            return
        deck_path = out / rec["config"] / slug(rec["topic"]) / "deck.json"
        doc = json.loads(deck_path.read_text(encoding="utf-8"))
        async with sem:
            try:
                rec["judge"] = await evaluate_lecture(judge, doc)
            except Exception as e:  # noqa: BLE001
                rec["judge"] = {"error": f"{type(e).__name__}: {e}"}

    await asyncio.gather(*(score(r) for r in records))


# ── 汇总 ───────────────────────────────────────────────────────────────────────
def _judge_scores(j: Any) -> tuple[Any, Any, Any, Any]:
    if not isinstance(j, dict) or "error" in j:
        return ("-", "-", "-", "-")

    def g(k: str) -> Any:
        v = j.get(k)
        return v.get("score") if isinstance(v, dict) else "-"

    return (g("content"), g("coherence"), g("pedagogy"), j.get("overall", "-"))


def write_summary(records: list[dict], out: Path, meta: dict) -> None:
    (out / "matrix.json").write_text(
        json.dumps({"meta": meta, "runs": records}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    lines: list[str] = []
    lines.append(f"# 模型对比实验 · {meta['timestamp']}\n")
    lines.append(
        f"- 页数目标：{meta['pages']} ｜ 样本：{'、'.join(meta['topics'])} ｜ "
        f"评委：{meta['judge']} ｜ seed={SEED} ｜ temp=0\n"
    )

    # 明细表
    lines.append("## 明细（每 run）\n")
    lines.append(
        "| 模型 | 样本 | 页 | 块 | 丢块 | 错误 | 结构 | 耗时s | 总token | 推理token | 内容 | 连贯 | 教学 | 总分 |"
    )
    lines.append("|---|---|--:|--:|--:|--:|:--:|--:|--:|--:|--:|--:|--:|--:|")
    for r in records:
        c, co, p, ov = _judge_scores(r.get("judge"))
        u = r.get("usage") or {}
        st = "✓" if r.get("structural_ok") else ("—" if not r.get("ok") else "✗")
        topic_short = r["topic"].split("（")[0]
        if r.get("ok"):
            lines.append(
                f"| {r['model']} | {topic_short} | {r['pages']} | {r['blocks']} | "
                f"{r['dropped']} | {r['errors']} | {st} | {r['elapsed_s']} | "
                f"{u.get('total_tokens','-')} | {u.get('reasoning_tokens','-')} | {c} | {co} | {p} | {ov} |"
            )
        else:
            lines.append(
                f"| {r['model']} | {topic_short} | — | — | — | — | — | "
                f"{r.get('elapsed_s','-')} | {u.get('total_tokens','-')} | - | - | - | - | ✗失败 |"
            )

    # 模型汇总（跨 3 样本均值）
    lines.append("\n## 模型汇总（3 样本均值）\n")
    lines.append(
        "| 模型 | 成功 | 平均页 | 平均丢块 | 平均错误 | 结构过率 | 平均耗时s | 平均总token | 平均总分 |"
    )
    lines.append("|---|--:|--:|--:|--:|:--:|--:|--:|--:|")
    by_model: dict[str, list[dict]] = {}
    for r in records:
        by_model.setdefault(r["model"], []).append(r)
    for model, rs in by_model.items():
        ok = [r for r in rs if r.get("ok")]
        n = len(rs)

        def avg(key: str, src: list[dict]) -> Any:
            vals = [r[key] for r in src if isinstance(r.get(key), (int, float))]
            return round(sum(vals) / len(vals), 1) if vals else "-"

        overalls = [
            _judge_scores(r.get("judge"))[3]
            for r in ok
            if isinstance(_judge_scores(r.get("judge"))[3], (int, float))
        ]
        avg_ov = round(sum(overalls) / len(overalls), 2) if overalls else "-"
        struct_rate = (
            f"{sum(1 for r in ok if r.get('structural_ok'))}/{n}" if ok else f"0/{n}"
        )
        avg_tok = avg("usage_total", [{"usage_total": (r.get("usage") or {}).get("total_tokens", 0)} for r in ok])
        lines.append(
            f"| {model} | {len(ok)}/{n} | {avg('pages', ok)} | {avg('dropped', ok)} | "
            f"{avg('errors', ok)} | {struct_rate} | {avg('elapsed_s', ok)} | {avg_tok} | {avg_ov} |"
        )

    # 多元度（每模型跨样本）
    lines.append("\n## 多元度（每模型跨 3 样本的版式/块型分布）\n")
    for model, rs in by_model.items():
        docs = []
        for r in rs:
            if r.get("ok"):
                dp = out / r["config"] / slug(r["topic"]) / "deck.json"
                if dp.exists():
                    docs.append(json.loads(dp.read_text(encoding="utf-8")))
        if docs:
            d = diversity(docs)
            lines.append(
                f"- **{model}**: 版式 {d['layout_kinds']} ｜ 块型 {d['block_types']} ｜ "
                f"非flow占比 {d['non_flow_ratio']} ｜ 最长同版式连跑 {d['longest_flow_run']}"
            )

    (out / "matrix.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


# ── 主入口 ─────────────────────────────────────────────────────────────────────
async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--smoke", action="store_true", help="冒烟：1 模型 × 1 样本 × 4 页")
    ap.add_argument("--no-judge", action="store_true", help="跳过 LLM 评审")
    args = ap.parse_args()

    load_env()
    models = MODELS[:1] if args.smoke else MODELS
    topics = TOPICS[:1] if args.smoke else TOPICS
    pages = 4 if args.smoke else PAGES

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out = ROOT / "results" / f"matrix_{'smoke_' if args.smoke else ''}{ts}"
    out.mkdir(parents=True, exist_ok=True)
    print(f"→ 实验目录: {out}")
    print(f"→ {len(models)} 模型 × {len(topics)} 样本 × {pages} 页 (并行模型/串行样本)")

    t0 = time.perf_counter()
    per_model = await asyncio.gather(
        *(model_worker(disp, cfg, out, pages, topics) for disp, cfg in models)
    )
    records = [r for sub in per_model for r in sub]
    print(f"→ 生成阶段完成 {round(time.perf_counter()-t0,1)}s")

    if not args.no_judge:
        print("→ 评审阶段（固定评委横评）...")
        await judge_all(records, out)

    meta = {
        "timestamp": ts,
        "pages": pages,
        "topics": topics,
        "models": [m[0] for m in models],
        "judge": JUDGE_CONFIG if not args.no_judge else None,
        "elapsed_total_s": round(time.perf_counter() - t0, 1),
    }
    write_summary(records, out, meta)
    print(f"✓ 汇总 → {out / 'matrix.md'}")
    print(f"✓ 明细 → {out / 'matrix.json'}")


if __name__ == "__main__":
    asyncio.run(main())
