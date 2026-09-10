# 退役 harness 代码

2026-09-10 清理，清理前 baseline：`eea81f9f`。

- `imgcut.py`：旧连通域抠图与 chroma 去溢色实现，当前媒体链路没有调用。
- `wire.py`：旧 `Request` / content block 模型，仅供 `attic/example.py` 等历史示例追溯。现行 `core/wire.py` 只保留日志使用的 `Usage`。

从生产 `core/llm.py` 删除未被调用的 `ask → to_responses → _once`、`Reply`、旧 `client()`，以及仅服务该链的空响应/超时计数与自动升 token 上限常量。原实现可从 baseline 查回，不复制整份传输层。

现行 `ModelRuntime` 的调用与重试、三种 API 适配器、Planner/Director 默认 runtime、Builder 独立 runtime 均保留。独立诊断 CLI（gallery、check_palette、check_cache）和显式关闭 Director 的路径不因默认路径不用就删除。
