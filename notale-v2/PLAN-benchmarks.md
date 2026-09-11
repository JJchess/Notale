
## 4. 接线（2026-09-10 晚已搭好）

- 仓库与数据在 `Notale/benchmark/`（gitignored，索引见其 README）。PresentBench 数据是 HF LFS 指针，机器没 git-lfs，education 子集已用 resolve URL 逐个拉齐。
- Planner 新增 `--materials <file|dir>`（可重复）：pdf 走 pdftotext、md/txt 原样，全文内联进 `deck.md` 的 `{materials}` 槽，落盘 `pages/materials/*.md`，briefs 里以相对路径列给 Builder 首轮 Read。不传时行为不变。
- `benchmark/notale/deck2pdf.py <run_root> <out.pdf>`：自起 no-store 静态服务，逐页 `?all` 截 1600×900 拼 PDF。
- `benchmark/notale/presentbench_case.sh <domain/course/case> [minutes]`：planner → builder → PDF → PresentBench judge，PDF 与分数落在 `benchmark/PresentBench/results/notale/<case>/generation_task/results/`。
- judge 用它默认的 gemini-3-flash-preview，key 在 `benchmark/PresentBench/.env`（GENAI_API_KEY）。

已知限制：pdftotext 丢图，"重建教材关键图表"类 checklist 拿不到分，v2 换文档 VLM 出 md + images 再接进素材记录；提示词是中文，材料为英文时要在 `--scenario` 里点明用材料语言写。

## 5. 第一题结果（2026-09-11 凌晨，education/MIT-the_human_brain/01，judge = gemini-3-flash-preview）

| 轮 | 说明 | 总分 | material_independent（基本功 / 版式） | material_dependent（完整 / 正确 / 忠实） |
|---|---|---|---|---|
| r1 | Builder 直接 Read 材料全文；26 页只出 11 页（Read 2000 行截断→补读撞首轮规则），页均输入 30–60 万 token | 59.5 | 52.5（46 / 59） | 64.1（100 / 92 / **0**） |
| r2 | Planner 在 FinalizePlan 给每页 300–490 字材料摘录（`sources_by_page`），Builder 不读全文；24 页出 23 页，合计输入 1,220 万 token | **67.1** | 71.7（85 / 59） | 64.1（100 / 92 / **0**） |

榜上对照：aippt 70.8、NotebookLM 62.5、Manus 57.8（全域均分，非 education 单题，只能粗看）。

**失分结构（r2）**
- 忠实类 class_3 **23/23 全 no**，占 20 分权重：每页都有材料里没有的数字——柱状图的 %BOLD 值、MNI 坐标、t 值、患者代号（把 Habib & Sirigu 的作者首字母编成 "Patient H.S."），甚至把 C.K. 这个面孔识别完好的经典病人写成面孔失认。这不是 PresentBench 特有的苛刻，是 Builder "有图表必配数"的习惯，之前 research loop 里"给文学判断编分数"是同一件事。修掉它单题可到约 87。
- 版式 class_2 7/17 no：封面深色其余浅色、密度过高、正文字号小、图表标注不一致。
- 基本功 1.13：中英混排——scenario 里写了"用材料语言（英文）"，Builder 仍写了中文正文。

**下一步候选**
1. Builder 侧禁编数：没有来源的数值不进图表，图表只画材料给的数或改为示意（无刻度）。这是 prompt/契约层改动，影响所有 deck，需要用户拍板。
2. 语言跟随材料：把语言要求从 scenario 提到 brief 的硬约束。
3. 跑完 MIT-the_human_brain 全部 11 题看方差，再决定是否推到 education 全子集。

## 6. 分支约定（2026-09-11）

产品与科研分开：本文档及材料通道的 harness 改动只在 `nv2-benchmark` 分支，工作树 `~/ws2/Notale-bench/`。`~/ws2/Notale/` 留在 nv2-dev 给产品线（与另一会话共用，不在那里切分支）。benchmark 脚本的 `NV2` 指向 Notale-bench；数据与外部仓库仍在 `Notale/benchmark/`。产品线需要材料通道时从本分支 cherry-pick。
