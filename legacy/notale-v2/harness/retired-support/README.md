# 退役辅助实现与旧产物协议

2026-09-10 从当前 harness 移出；归档前 baseline：`7c3fcea4`。
这些文件是历史源码，不是运行时资源。当前 core、tools 和测试不得导入这里。
不提供兼容转发；复现实验时应从 baseline 恢复当时的工作树，不能直接把归档脚本当成当前命令运行。

| 归档位置 | 原位置与用途 |
| --- | --- |
| `core/annotate_focus.py` | 同名 core 模块；历史页表视觉焦点消融 |
| `core/gallery.py` | 同名 core 模块；旧参考画廊索引与颜色统计 |
| `core/check_cache.py`、`core/check_palette.py`、`core/cost.py` | 同名 core 模块；独立缓存、配色、费用诊断命令，不参与生成 |
| `core/sample_bundles.py`、`core/sample_shots.py` | 同名 core 模块；样本源码包与截图生成器，已生成资源仍留在当前 skills 中 |
| `core/artifacts.py` | 原模块的旧 Block / Entry / Plan / Contract 解析器；当前 Brief 未复制进来 |
| `core/trace_analysis.py` | 原 core/trace.py 的 usage_of / responses / span；当前 TraceRow、Writer 未复制进来 |
| `core/wire.py` | 原 core/wire.py；仅供上述旧分析函数使用的 Usage，与上一级更早的 Request 模型不同 |
| `test/test_artifacts.py` | 原同名测试；读取 nn-06 历史 PLAN、CONTRACT 和 brief 的验证脚本 |
| `test/test_sample_generation.py` | 原 test/test_skills.py 中依赖生成器或 legacy 完整样本的方法，保留原实现供追溯 |
| `scripts/dump_brief.py` | 已退役的报错入口；当前输入导出工具仍是 scripts/dump_page.py |

当前测试直接检查交付样本、源码、依赖与 Brief，不依赖此归档。日志字段、脱敏、工具证据、模型用量采集、请求与工具执行均未改变。

