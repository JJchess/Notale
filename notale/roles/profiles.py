"""Versioned, model-independent agent role contracts."""

from __future__ import annotations

from notale.roles.base import RoleSpec
from notale.roles.authoring import LECTURE_AUTHORING
from notale.utils.config import get_config


_CONFIG = get_config()


def _budget_kwargs(name: str) -> dict[str, int | float | str]:
    role = _CONFIG.agents.role_for(name)
    emergency = _CONFIG.governance.emergency_limits
    capabilities = _CONFIG.model_capabilities
    return {
        "max_turns": emergency.query_max_turns,
        "max_tokens": capabilities.max_output_tokens,
        "context_window_tokens": capabilities.context_window_tokens,
        "auto_compact_threshold_tokens": role.auto_compact_threshold_tokens,
        "max_total_turns": emergency.worker_max_turns,
        "max_duration_sec": emergency.worker_max_duration_sec,
        "max_total_tokens": emergency.worker_max_total_tokens,
        "request_timeout_sec": emergency.provider_timeout_sec,
        "max_query_duration_sec": emergency.query_max_duration_sec,
        "max_provider_attempts": emergency.provider_max_attempts,
        "version": role.version or _CONFIG.agents.defaults.version,
    }


_COMMON = ["skill_read", "artifact_read", "artifact_search", "report_blocker"]


def _planner_skills() -> list[str]:
    skills = ["curriculum-planning"]
    design = _CONFIG.agents.planner_deck_design
    if design.enabled and design.skill not in skills:
        skills.append(design.skill)
    return skills

INTAKE = RoleSpec(
    name="intake",
    system_prompt=(
        "你是课程需求分析 agent。读取完整请求和材料后直接通过 submit_course_brief "
        "提交结构化简报。Harness 根据真实工具事件维护任务状态；不要手工叙述进度。"
    ),
    allowed_tools=[*_COMMON, "submit_course_brief"],
    skills=["course-intake"],
    **_budget_kwargs("intake"),
)

RESEARCH = RoleSpec(
    name="research",
    system_prompt=(
        "你是备课研究员。先读取本 worker 实际分配的 skills，再按当前专能和工具权限"
        "完成研究。需要网络证据且具备相应工具时，必须先发现真实 URL、再抓取原文；"
        "不得猜 URL。引文必须逐字出现在本 worker 抓取的原文中。"
        "提交通过 submit_research 完成，Harness 自动记录任务证据。"
    ),
    allowed_tools=[*_COMMON, "web_search", "fetch_web", "submit_research"],
    skills=["research-evidence", "web-access"],
    **_budget_kwargs("research"),
)

PLANNER = RoleSpec(
    name="planner",
    system_prompt=(
        "你是课程学习架构与证据路由 agent。读取完整 CourseBrief、PrepRecord 与 PedagogyNote，"
        "依据受众先验、课程目标和确定性预算锁定学习序列、全局约定与逐页资料分配，并通过 "
        "submit_contract 提交。每页 centralMessage 是一个知识命题；learningAction 是比较、预测、"
        "追踪、解释或应用等认知活动，不是界面动作。优先使用 Research 资料；可以补充稳定、通用的"
        "教材知识，但必须先生成 planner-generated PrepRecord，再绑定到使用它的页面。不得用仅仅"
        "主题相关的记录冒充命题依据；boundPrepRecords 必须覆盖交给 Builder 的事实基础，并尊重"
        "记录的 invariants、validRange 与 knownInaccuracies。锁定全书叙事主线、选择性的跨页"
        "关系和共享视觉契约，但不要替"
        "页面 Builder 指定单页视觉对象、布局、标题、副标题、控件或交互实现。"
        "Harness 自动维护任务状态；不得用自然语言冒充 artifact。"
    ),
    allowed_tools=[*_COMMON, "submit_contract"],
    skills=_planner_skills(),
    **_budget_kwargs("planner"),
)


def planner_profile(page_count: int) -> RoleSpec:
    """Keep the signature stable; page count scales work, not the emergency output ceiling."""
    del page_count
    return PLANNER

_BUILDER_SKILLS_ALL = list(_CONFIG.agents.builder_skills)


_PAGE_TOOLS = [
    "skill_read", "context_read",
    "acquire_media", "generate_media",
    "page_write", "page_read", "page_search", "page_patch",
    "check_page", "submit_page", "report_blocker",
]

BUILDER = RoleSpec(
    name="builder",
    system_prompt=(
        "你是 HTML-native 讲义页面 builder。只实现分配给你的单页。先读取绑定上下文和必要 skill，"
        "PageContext.skills 是完整的精确分配；按顺序把每个 skill 读到 EOF；如果某项包含"
        "entrypoint，每个分块都必须传入该入口。不要根据 page type 猜测 skill 或入口。"
        "你负责最终标题、副标题、视觉对象、构图、媒体与交互形式；不得把 learningAction、"
        "邻页摘要或内部设计信息改写成可见说明。根据学习动作选择最简单有效的表达，"
        "可识别的历史人物、文献、地点或事件优先调用 acquire_media 获取真实素材；"
        "generate_media 只用于非纪实的编辑性插图。媒体工具失败或预算耗尽时不要重复同一调用，"
        "改用不伪装成真实素材的静态学科图示。"
        "若页面包含教学性交互，真实算法、方程、状态机、判定规则或数据变换必须是唯一状态源；"
        "控件只向模型提交输入或控制 trace 回放，DOM/SVG/Canvas 只投影模型输出，不得手工伪造教学状态。"
        "把 narrative 当作内部连续性约束，不要把 pageId、关系名或规划提示显示给学生。"
        "用 page_write 生成后立即 check_page；仅针对检查错误 page_patch，禁止逐段重读整页，"
        "check_page 通过后 submit_page。Harness 自动维护任务台账。"
    ),
    allowed_tools=_PAGE_TOOLS,
    skills=list(_BUILDER_SKILLS_ALL),
    system_profiles=(LECTURE_AUTHORING,),
    **_budget_kwargs("builder"),
)

def builder_profile(page_type: object) -> RoleSpec:
    """Page type scales worker count and experience labels, not normal completion budgets."""
    del page_type
    return BUILDER
