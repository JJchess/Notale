"""实验记录契约（L0 kernel）—— 账本一行 = 一次生成的 provenance + 能力画像 + 代价。

`results/ledger.jsonl` 每行一个 `ExperimentRecord.model_dump_json()`。记录 hook(`app/container.py`)
与历史回填(`scripts/backfill_ledger.py`)都产它、都校验它——账本永远是合法 ExperimentRecord 的拼接，
不是自由格式日志。热力图（viewer/build_coverage.py）只读这个真源。
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class CodeMarker(BaseModel):
    """产出这条记录时的 agent 代码版本——排查"哪些能力因为哪次代码改动变冷/变热"的关键字段。"""

    model_config = ConfigDict(extra="allow")
    git_rev: str | None = None  # `git rev-parse --short HEAD`；不在 git 仓库/子进程失败时留空
    git_dirty: bool | None = None  # 工作区相对 git_rev 是否有未提交改动
    agent_fingerprint: str | None = (
        None  # 仅对 agent 相关代码面取 sha256 前 12 位；见 app/codeprint.py
    )
    label: str | None = None  # 可选人工标签（如 "historical"、"phase3-lecture-agent"）


class Cost(BaseModel):
    model_config = ConfigDict(extra="allow")
    prompt_tokens: int = 0
    completion_tokens: int = 0
    reasoning_tokens: int = 0
    total_tokens: int = 0
    calls: int = 0


class CapabilityProfile(BaseModel):
    """一份 deck 的能力画像——存计数不存整份 deck，供热力图直接聚合。"""

    model_config = ConfigDict(extra="allow")
    theme: str | None = None
    block_types: dict[str, int] = Field(default_factory=dict)
    variants: dict[str, int] = Field(default_factory=dict)
    layouts: dict[str, int] = Field(default_factory=dict)
    scene_kinds: dict[str, int] = Field(default_factory=dict)
    fragment_blocks: int = 0
    fragment_names: dict[str, int] = Field(default_factory=dict)
    transition_scenes: int = 0
    autoanimate_scenes: int = 0
    hero_image: int = 0
    list_icons: int = 0
    video_blocks: int = 0
    pages: int = 0
    blocks_total: int = 0


class ExperimentRecord(BaseModel):
    """`results/ledger.jsonl` 的一行。字段分 6 组：identity/code/knobs/outcome/cost/profile。"""

    model_config = ConfigDict(extra="allow")

    # identity
    run_id: str
    ts: str  # ISO 本地时间
    source: str = "generate"  # "generate" | "matrix" | "backfill"

    # code（版本标记）
    code: CodeMarker = Field(default_factory=CodeMarker)

    # knobs
    model: str | None = None
    llm_cfg: str | None = None
    generator_cfg: str | None = None
    options: dict[str, object] = Field(default_factory=dict)
    theme: str | None = None
    topic: str | None = None
    pages_target: int | None = None
    seed: int | None = None
    audience: str | None = None
    wants: str | None = None
    extra: str | None = None

    # outcome
    ok: bool = True
    elapsed_s: float | None = None
    pages: int | None = None
    blocks: int | None = None
    dropped: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    perspectives: int | None = None

    # cost
    cost: Cost = Field(default_factory=Cost)

    # profile
    profile: CapabilityProfile = Field(default_factory=CapabilityProfile)
