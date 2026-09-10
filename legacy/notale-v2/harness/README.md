# 退役 harness 代码

2026-09-10 清理，清理前 baseline：`eea81f9f`。

- `imgcut.py`：旧连通域抠图与 chroma 去溢色实现，当前媒体链路没有调用。
- `wire.py`：旧 `Request` / content block 模型，仅供 `attic/example.py` 等历史示例追溯。
- [retired-support/](retired-support/README.md)：后续移出的独立诊断、样本生成器、旧产物解析器和 trace 分析；其中的 `core/wire.py` 是另一代 `Usage` 模型，不覆盖本目录的旧 Request 模型。

从生产 `core/llm.py` 删除未被调用的 `ask → to_responses → _once`、`Reply`、旧 `client()`，以及仅服务该链的空响应/超时计数与自动升 token 上限常量。原实现可从 baseline 查回，不复制整份传输层。

现行 `ModelRuntime` 的调用与重试、三种 API 适配器、Planner/Director 默认 runtime、Builder 独立 runtime、显式关闭 Director 的路径均保留。独立诊断 CLI 后续按用户确认移入 retired-support，不再作为当前入口。
