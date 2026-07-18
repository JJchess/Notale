"""agent —— L4 编排。依赖 schema+ports+domain，只认接口不认实现（禁 import adapters）。"""

from .orchestrator import GenerateResult, GeneratorOptions, generate_lecture

__all__ = ["GenerateResult", "GeneratorOptions", "generate_lecture"]
