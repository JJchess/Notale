"""domain.evaluation —— PPTEval 式三维评测 + 覆盖度 + 多元度（对应旧 evaluate/coverage/diversity.mjs）。"""

from .coverage import check_coverage
from .diversity import diversity
from .ppteval import evaluate_lecture, summarize

__all__ = ["evaluate_lecture", "summarize", "check_coverage", "diversity"]
