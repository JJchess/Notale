# 历史归档

这里保存已退役的实现、被取代的方案和旧架构，不是待实施清单，也不是运行时输入。
2026-09-10 整理；整理前 baseline：`eea81f9f`。原 `notale-v2/legacy/` 与 `notale-v2/attic/` 统一迁至此目录，只迁移、不销毁历史内容。

当前入口：[Style Director 契约](../../notale-v2/PLAN-style-control.md) · [架构 v4](../../notale-v2/ARCHITECTURE-v4.html)。

| 位置 | 内容与边界 |
| --- | --- |
| [docs/](docs/) | 旧风格方案、审阅稿、媒体计划与旧图片检索方案；媒体 v2 第 3 节的 A 阶段交付契约仍保留供查阅 |
| [architecture/](architecture/) | 架构 v1–v3；`mkarch.py` 仅重建同目录 v1 图，不生成当前 v4 |
| [prompts/direction-menus.md](prompts/direction-menus.md) | 已退役方向菜单，生产不加载 |
| [harness/](harness/) | 已退出生产链路的抠图实现和旧请求模型；无兼容回接 |
| [experiments/](experiments/README.md) | 18 个旧实验启动脚本，保留原输入与命令，不作为当前入口 |
| [full-samples/](full-samples/) | 完整样例归档，内部目录结构与资源不变 |
| [image-search/](image-search/README.md) | 图片检索旧实现，保留恢复用源码快照 |
| [attic/](attic/README.md) | 更早的 schema、workflow 等实现，保留内部结构与历史状态，不作为可直接运行的现行代码 |

## 方案索引

- [Style Director 历史方案与实验](docs/PLAN-style-control-history-20260910.md)
- [v3 风格审阅](docs/PLAN-style-control-v3-review.md)
- [auto-only 历史草案](docs/PLAN-style-director-auto-only.md)（未采纳的建议不因归档变成现行设计）
- [Director / Builder 整改审阅](docs/STYLE-RECTIFICATION-CRITIC.md)
- [媒体计划 v2](docs/PLAN-media-template-v2.md) · [更早媒体计划](docs/PLAN-media-template.md)
- [旧图片检索方案](docs/PLAN-image-search.md)
- [旧 Builder 输入快照](docs/BRIEF-SAMPLE.md) · [分镜方法提案](docs/METHOD-beat-sheet.md) · [旧输入精简提案](docs/PLAN-input-trim.md)

文档里的历史命令、反引号代码路径仍按原 `notale-v2/` 工作目录理解；可点击相对链接已随迁移调整。历史日期、状态及失败记录不改写为当前结果。

旧 run、实验产物、预览，以及仍被预览引用的根目录验收报告保留原位。研究与编辑器计划仍保留；旧输入精简提案已按用户确认归档，不作为后续实施清单。
