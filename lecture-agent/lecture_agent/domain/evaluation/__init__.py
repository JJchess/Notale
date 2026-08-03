"""domain.evaluation —— PPTEval 式三维评测 + 覆盖度 + 多元度 + 确定性门 + 去偏成对（对应旧 evaluate/coverage/diversity.mjs）。"""

from .completeness import detect_truncation, gate, hero_on_topic, page_adherence
from .coverage import check_coverage
from .diversity import diversity
from .page_quality import PageReview, review_page
from .pairwise import compare, rank
from .plan_quality import refine_plan, replan_page, validate_plan_revision
from .ppteval import evaluate_lecture, summarize

__all__ = [
    "evaluate_lecture",
    "summarize",
    "check_coverage",
    "diversity",
    "detect_truncation",
    "hero_on_topic",
    "page_adherence",
    "gate",
    "compare",
    "rank",
    "PageReview",
    "review_page",
    "refine_plan",
    "replan_page",
    "validate_plan_revision",
]
