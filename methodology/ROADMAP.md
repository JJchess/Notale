# 四大问题突破路线 + 主干待决 ADR

> 每个问题按"根因 → 赌注 → 首批动作"给出。执行顺序服从宪章轨道轮换纪律；
> T-TRUTH（正确性）为第一优先（用户 2026-08-08 拍板）。
> 本文档只定方向与判据，不含实施承诺——具体每轮做什么由 checklist 第 2 步现场决定。

---

## 问题 1 · 页面单薄（T-VIS）

**根因排序**：
1. **文本 LLM 盲猜几何是第一因**——默认 `absolute_frames` 路径让文本模型一次性裸猜 1280×720 像素坐标；文本模型没有视觉先验，对"丰满构图"只有语言描述、没有测量反馈（2026-08-07 run：主证据利用率 0.8–1.4%）。
2. 封闭 token 词表太弱——`docs/CONTENT_TAXONOMY.md` 明确列出的缺口：无形状/装饰基元、无动画编排、无背景/渐变/遮罩 token。即使从丰满的 master image 分解，也会被词表压扁成盒子堆。
3. 媒体选择率低（media 块 opt-in、罕被选中）。

**赌注**：**图像先验**（v2 已下注：图像模型天然产出满构图、有装饰层、有背景氛围的整页）+ **词表扩容护住分解保真度**。布局引擎+测量反馈是 Track 1 走过的死路的高级版，不再押；design-examples RAG 是词表稳定后的三阶精修。

**首批动作**：
1. 基元词表扩容：shape/decoration/background-gradient/mask/motif，锚 `docs/CONTENT_TAXONOMY.md` 缺口清单 + `legacy/DESIGN_RESEARCH.md` 的 T1–T24 机制。
2. 分解保真度探针：重编译页截图 vs master image 结构相似度，低于阈值触发定向重写——把"压扁"变成可测量、可拒收的缺陷。
3. 趋势指标先行：图形元素在位率/墨水比进 scorecard（`EVAL.md` §3），让"单薄"从观感变成曲线。

## 问题 2 · 长程 60 分钟（T-LONG）

**现状**：分层规划两处都有——Track 1 的 `_plan_hierarchical` 在默认路径下**从未被执行**（`planning.py:994`）；v2 的 content-planner 是长程优先的（3–70 页、分批故事地图、反重复上下文、36 页已提交样例）。**全仓库没有时长模型。**

**必须新建四件**（依赖序）：
1. **时长→页数→密度模型**（第一交付物）：从 `eval/gold/` 金样本拟合 minutes → 页数分布/每页信息量/图文比/习题间隔；按 contentKind 定分钟权重（开场 ~0.5 / 讲解 1.5–2 / 交互 sim 3–4 / 小结 ~1），60 分钟 ≈ 30–40 页 ≈ 6–8 章。模型反向工作：用户给时长，规划器解出页数分布与每页 pacing 标注（speaker notes 与交互复杂度都消费它）。
2. **断点续跑**：run manifest（每页状态机 planned→designed→…→accepted）+ `--resume`。便宜，但**解锁一切后续迭代**——没有它，60 分钟 deck 每次失败都是全量重跑。
3. **局部失败打捞**：页级重写循环之上补章级降级——某页 N 次仍不过验收 → 降级为安全排版模板页（丑但正确），标记 manifest 供回补，**绝不让一页卡死整本**。
4. **跨章一致性台账**：notation ledger（符号/术语首次定义处+全篇统一，规划期建立、展开时注入、验收期校验）+ character sheet（叙事实体视觉描述跨章复用——第 3 章和第 17 章得是同一个曹冲）。与备课资料里的"故事"那类记录同源。

## 问题 3 · 正确性（T-TRUTH，第一优先）

即 [`PREP.md`](./PREP.md) 的落地序：**T0/T1 先行**（render-check 已有；"由资料生成 + 绑外生参照物"是纯工程，见 [`VERIFY-EXEC.md`](./VERIFY-EXEC.md)——按参照物强度排：闭式解 > 独立参考实现 > 声明的规格 > 学科定律 > 变换不变性），再 G4 出处绑定（提取时确定性绑定 + 字面子串校验，纯机器），再 T2 复算，再 T4 故事资料 schema + 单帧蒙眼问卷。联网检索是"事实"那类的强制输入——v2 已有 web-evidence 半套，Track 1 没有。判官抽查五条（掺沙/判分指出处/拿人校准）与 SABOTAGE 库同步建。

## 问题 4 · 多样性（T-STYLE）

**判断：不需要推倒重来。** "Claude 味"来自封闭 token 词表 + 文本 LLM 的无约束默认审美；v2 的 preset（7 艺术指导预设）× archetype（12 专家原型）× audience（7 受众阶段）机制已经是解药的形状。宪章 v2 自己写了升级路径（"审美红线值得比 bug 更主动地钉死"）——**执行它，而不是重写它**。

**四个动作**：
1. **统一 authoring profile + 人工回归集**：把宪章 §7 作为 Planner/Builder 写作制度与盲评样例；
   浏览器只检查 computed style、资源和运行状态等客观事实，不对文案句式维护黑名单。
2. **预设从代码变数据**：版本化 preset pack（JSON + 参考图 + 字体清单 + motif 库），新增风格不改代码；顺带治愈 Track 1"扩主题要同步改 3 处"的旧病。
3. **按 deck 采样**：topic 哈希做种子采样 preset×archetype，用户可显式覆盖；同题重复生成强制换簇（Q9 的达标手段）。
4. **交互岛屿风格桥**：若主干 ADR 判给"岛屿"方案，widget 的 8 方向美学必须接 preset token（CSS 变量注入 iframe），别让交互岛屿把 Claude 味带回来。

多样性从"换个颜色"变成可测量的向量距离（风格指纹，`EVAL.md` §3）：色板相同/字阶相同/版式序列相同的"伪多样"会被指纹当场拆穿。

---

## §5 主干待决 ADR（status: OPEN——录入 decisions.md 前的草案）

**问题**：三代并存（legacy 冻结 / lecture-agent Python / v2 Node），评测基准需要唯一靶子，主干必须收敛。

**候选**：
- **A. v2 主干 + 交互岛屿**（探索结论中的领先候选）：v2 立为 mainline；冻结 lecture-agent 引擎（保留为 widget 库与 evidence-obligation 思想来源）；把 `viewer/doc-to-deck.js` 的 quiz/sim/runnable/Pyodide 运行时抽成 vendor 包，native-scene 增加 island 槽位节点，probe 增加交互驱动断言。理由：图像先验解单薄、故事地图解长程、preset 解多样性均是结构性解决；v2 唯独缺交互，而交互恰是 Track 1 唯一成熟资产。
- **B. 修复 Track 1**：修 `absolute_frames` 旁路缺陷让已建质量机制生效，v2 继续作实验线。理由：保住 Python 主干与已有投入。
- **C. 第三条路**：以备课资料为接口的新组合（用户直觉：也许有比 A/B 更好的形态）。备课资料（[`PREP.md`](./PREP.md)）本就与技术路线无关，C 的探索成本被刻意压低。

**判决数据标准**（满足后才允许追加 ADR 定案）：
1. 两轨（或 C 的原型）在 B-CORE 子集（建议 Q2/Q3/Q5/Q10 四题）同题对比的硬门通过率与盲测成对胜率；
2. 交互岛屿可行性 spike 结论（island 槽位 + style-token 桥能否在 v2 编译器内以周级工作量落地）；
3. 接备课资料的改造量评估（哪条轨道改起来小）。

判决走六维规约 + `lecture-agent/docs/harness/decisions.md` 追加，任何一票否决记 `rejected.md`。

## §6 明确不做清单

- 后端仿真环境（浏览器内 Pyodide/matter.js 覆盖教学级需求，defer 待真实需求触发 ADR）
- 多拍动画时序验证、对抗式判官（研究项，不阻塞）
- design-examples RAG（词表稳定前不议）
- Track 1 `absolute_frames` 缺陷修复（在主干 ADR 判决前不投入；该缺陷作为 G1 门的靶子留档）
