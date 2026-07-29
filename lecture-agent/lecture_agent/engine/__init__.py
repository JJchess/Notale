"""engine —— L4 共享建 deck 引擎（确定性流水线）。

两条流水线都调它:批量/实验前端 `app/generate.py` 直接调 `generate_lecture`;对话式外壳
`shell/tools/make.py` 把它包成 `make_lecture` 工具。依赖 schema+ports+domain,只认接口不认实现
(禁 import adapters,也禁 import shell/app——保持共享、可被两侧复用)。
"""

from .pipeline import GenerateResult, GeneratorOptions, generate_lecture

__all__ = ["GenerateResult", "GeneratorOptions", "generate_lecture"]
