"""把 fan-out 生成的 block 按 id 回填进骨架 doc（纯函数）。

保留规划器分配的块 id（scene.layout 的 steps/anchor 引用依赖它）。整页全失败时补一个占位 callout（不丢页）。
返回被丢弃的 block 描述列表，供上层报告。
"""

from __future__ import annotations

from typing import Any


def fill_blocks(doc: dict[str, Any], blocks_by_id: dict[str, dict[str, Any] | None]) -> list[str]:
    """就地把 doc.scenes[].blocks 的占位块替换为生成结果；返回 dropped 描述列表。"""
    dropped: list[str] = []
    for s in doc.get("scenes", []):
        frames_owned = (
            isinstance(s.get("layout"), dict)
            and s["layout"].get("kind") == "frames"
        )
        kept: list[dict[str, Any]] = []
        scene_dropped = False
        for ph in s.get("blocks", []):
            bid = ph.get("id")
            gen = blocks_by_id.get(bid) if bid else None
            if gen is not None:
                gen["id"] = bid  # 保留 id 供版式引用
                kept.append(gen)
            else:
                dropped.append(f"{bid}({ph.get('type')})")
                scene_dropped = True
                if frames_owned and bid:
                    # Keep the planner's one-frame/one-block mapping observable.  A failed
                    # generator becomes an explicit in-frame failure surface; deleting it and
                    # clearing layout would silently hand geometry back to the legacy compiler.
                    kept.append({
                        "id": bid,
                        "type": "callout",
                        "label": "生成失败",
                        "text": f"{ph.get('type') or 'block'} 未生成；保留原 frame 供实验诊断。",
                    })
        if not kept:
            kept.append({"type": "callout", "label": "待补", "text": "本页 block 生成失败，需重跑"})
        s["blocks"] = kept
        if scene_dropped and not frames_owned:
            s.pop("layout", None)
    return dropped
