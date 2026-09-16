# 跑榜结果台账（人读版；机器版在 ledger.jsonl）

## PresentBench · education/MIT-the_human_brain/01（judge gemini-3-flash-preview）

| 轮 | dev | 说明 | 总分 | 基本功/版式 | 完整/正确/忠实 |
|---|---|---|---|---|---|
| r1 2026-09-10 | 1bd0b6dd 之前 | Builder Read 材料全文，11/26 页 | 59.5 | 46 / 59 | 100 / 92 / 0 |
| r2 2026-09-11 | 同上 | sources_by_page，23/24 页 | 67.1 | 85 / 59 | 100 / 92 / 0 |

榜（全域均分）：aippt 70.8 · NotebookLM 62.5 · Manus 57.8。

## SlidesGen-Bench · Aesthetics（确定性，零 token）· 同一套 r2 PDF（23 页）· 2026-09-13

| | Usability | Engagement | Harmony | Rhythm | Aesthetics |
|---|---|---|---|---|---|
| **Notale r2（1 套）** | 4.56 | 7.77 | 0.00 | 14.93 | **27.26** |
| Skywork-Banana（榜首） | 5.62 | 8.30 | -0.47 | 13.84 | 27.28 |
| Kimi-Banana | 5.72 | 6.41 | -0.55 | 15.01 | 26.58 |
| NotebookLM | 4.13 | 7.32 | -0.35 | 11.72 | 22.82 |
| Gamma | 5.31 | 6.31 | -1.51 | 6.99 | 17.09 |

读法：只有一套 deck，且题目来自 PresentBench 而非 SlidesGen 的指令集，只能说"量级在榜首那一档"，不能说排名。
Rhythm 高是我们的页与页之间视觉密度起伏大（VisualHRV 奖励这个）；Usability 中游，对应 PresentBench 里"字太小/太密"的判词。
Harmony 恰好 0.00 待核（其他产品都是负值）。

## InteractScience · 裸模型 gemini-3.8-flash（不经 Notale）· 2026-09-13

| | PFT Overall | PFT Average | PFT Perfect | VQT Action |
|---|---|---|---|---|
| gemini-3.8-flash / low（我们的锁定模型） | 47.9% | 45.1% | 16.7% | 89.7% |

榜上参照见 `InteractScience/README.md` 第 198 行起。CLIP 与 VLM-judge 两列没跑（要装 torch），用户已定不再投入。
这个数只当"裸模型会不会写交互前端"的参照：Notale 交互页出问题时分清是模型不会还是 harness 带歪。
