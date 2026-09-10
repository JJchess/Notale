# Style Director 当前契约与收敛记录

2026-09-10。唯一当前入口；[历史方案与实验](../../legacy/notale-v2/docs/PLAN-style-control-history-20260910.md)只供追溯，不作为并行实施清单。

## 职责与流程

seed 后 Planner 与 Director 并行。Planner 规划页表和内容素材，Director 根据 query、audience、scenario 与用户明确要求确定主题方向；双方不交换页表。两者完成后，Builder 结合逐页内容设计 slides。

auto：40 项无题材预分配的轻索引与完整小概览 → 选主要方向并保存理由 → 宿主自动加载选中详情、原图、中英字体声明 → 同一 Director history 写主题。理想路径两次模型调用，技术修订或按需媒体工具可能增加实际次数，不保证固定两次。

保留显式风格、用户参考、修改及复用入口；有效主题不要求修改时零调用复用，无授权不重写无效主题。Director 默认打开；显式关闭能力保留。代码工作台独立，不承接本轮视觉主题。

## 交付与消费

- 一个原生 `theme.css`，首段为简短 INTERFACE；附带实际引用的本地资源。不产生 style.json、主题继承、adapter 或独立说明文件。
- 根 token 与 `html[data-variant]` 配套选择前景/背景；`#stage` 多层 background-image 合成，不设第二个背景开关。
- 接口列实际公开的字体/标题角色、样式用法、变体与净空，不枚举所有私有类。
- 通过 reference 行指认最终主参考。Builder 默认接收该图与接口，颜色和字体以最终 CSS 为准；旧包无声明时保留用户图回退，不将候选图冒充最终方向。
- Director 提供共享视觉基础，Builder 决定主体、版式、数据系列和交互；具名样式是可选实现，不是强制组件清单。
- 风格与配色可组合，字体推荐不是唯一答案；中文与英文均参与表达，不按字体种数验收。

## 运行与视觉边界

保留真实资源/路径、CSS 语法、公开接口存在性、底盘缩放和输入行为的技术检查。根与公开接口不发放无语义 surface/panel/card 底色槽；具名局部材质合法。

避免默认通用 Paper 反复套壳；与风格一致的容器可承载完整图表、数值或操作区。白底、有框、阴影或面积大均不能单独判错，也不靠加粗边框自动成立。不新增颜色、明度、卡片数、字体数或风格多样性重试阈值。

Builder 首轮 Read、自由修订、结束条件和最终独立 Check 保持。无补催、修复 agent、换模型或无风格兜底；技术通过不等于视觉通过。

## 本轮剪枝与模型默认

全仓 baseline：`03a78e32`。不含被 Git 忽略的文件；内嵌 Brave Search 研究仓库记录为 gitlink，不含其内部文件和历史。旧 run、预览和用户原有内容不回写。

- 同一角色的重复提示按职责归位：CHASSIS 管机制，tech 管创作契约，direction 管方向，style-theme 管 CSS 交付，ban list 管失效模式，Check 管实际证据。跨角色必要规则保留。
- 40 项详情删除公共套话，保留原 description、参考图、字体搭配及资源链接，不新增 Read。
- 退役 `--frame-cap`、`--direction-menus`、`planner.iface_gaps()` 和未被生产调用的 `builder.ref_images()`。旧参数报未知参数，无兼容空实现；旧产物和主题包仍可使用。历史菜单见 [归档](../../legacy/notale-v2/prompts/direction-menus.md)。
- 默认 Planner/Director/视觉 Builder 为 `gemini38-google-low`，代码页保留 `deepseek-v4-flash-low`；显式覆盖及实验模型固定保留。默认配置对齐与提示剪枝分开记录。

## 验证与未解决问题

剪枝前证据：[三题 auto 报告](../../experiments/runs/notale-v2/style-auto-adapt-0910-r1-report/REVIEW.md)。9 页交付，三题方向可辨；种子套装仍有 Paper 重复，中文字体尚未充分分化。不是全风格稳定性证明。

本轮剪枝已完成：[收敛验收记录](../../experiments/runs/notale-v2/style-prune-auto-0910-r1-report/REVIEW.md)。58 项相关离线检查通过（0.601s），40 项详情与字体可解析；唯一一次三题 auto 交付 9/9 页，生成墙钟 168.79s，主链路 78 次响应，Director 各 3 次。各套只组装一次，查看全部 9 页并抽查核心交互，无运行错误；种子操作区空白、细部观察不足等视觉弱项仍保留。未指定风格、未跑付费 reference/modify、未手工修页或追加实验；不据单次采样声称性能提升。

发现明确失败如实保留；确定性修复只补相关检查，修改后未再生成验证的状态明确标注。稳定预览保留，不用失败候选覆盖。
