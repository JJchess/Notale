# 集成学习：先拟页表、再按需搜图全量实验

2026-09-07。未手工修生成页面，未添加新门禁。

## 配置

- Query：集成学习--机器学习概论第八讲；90 分钟。
- 读者：学过一点相关基础、但没系统学过这个题目的读者；场合沿用上次为空。
- Planner 与全部 Builder：gemini-3.8-flash / low，Google 官方兼容接口，profile=gemini38-google-low。
- Builder 并发上限 30；本次共 22 页，使用 --uniform，所有页型均同一模型。
- mini + aux samples，notes=notes；Style Director 本次未调用，复用 ens-trim-full-0907 的主题。
- 主题 SHA-256 与基线相同：6b9ed49bc6aa0b9caec0fbf2b0ca2df6aa2498d46b091d49c1e78dbd27c9dc84。
- 本次提示变化：先拟页表草稿，再按页需要取图、查看和调整，最后 FinalizePlan。未接入外部内容规划 skill，也未新增来源页或人物照片要求。
- 实验脚本只增加 --concurrency 参数（默认仍为 6），并在 experiment.json 记录实际值。

运行命令：

```bash
python3 -B -u experiments/media-a-20260907/run_full.py --label ens-plan-first-0907-2234 --concurrency 30
```

## 结果

| 项目 | 结果 |
|---|---|
| Planner | 3 次响应，约 21 秒；输入 13,577 / 输出 1,249 token |
| Builder | 22/22 页生成，165 次响应；158.6 秒 |
| Builder token | 输入 4,458,065 / 输出 229,031 |
| 生成阶段合计墙钟 | 约 180 秒，不含随后浏览器验证 |
| 页型 | 标题 6、内容 8、交互 5、代码 3 |
| 独立审计 | 0 致命错误、0 视觉警告；3 个代码工作台自检通过 |
| HTTP 浏览器检查 | 22/22 页检查，无 pageerror、console.error、requestfailed |
| Planner 素材 | 1 次 ImageSearch，3 张下载候选，最终分配 1 张给 page-07 |
| Builder 取图 | 无 ImageSearch / ImageGen 调用 |
| 实际显示素材图片 | 0 页；浏览器亦未记录 assets/img 资源加载 |
| 来源／历史专页 | 页表中没有 |

Planner 工具顺序：ImageSearch → FinalizePlan（无效映射）→ FinalizePlan（恢复）。
搜索词是 Leo Breiman random forest，选中的仍是 Decision Tree vs. Random Forest.png，不是人物照片。
首次映射键为 "12"，不是有效页号；现有校验退回，模型改为 "page-07" 后完成。没有人工干预或新校验。

草稿没有要求单独输出，因此 trace 无法证明模型内部是否真的先拟好了页表；不能仅凭修改后的提示声称它已遵守内部思考顺序。

## 内容问题与验证边界

1. page-07 的 Read 只有 general.md 与两份样本，未读取分配的素材；页面自行绘制树结构。该次结果仍未解决素材不使用问题。
2. 没有独立算法来源／历史页。这次只修改顺序，不能认为内容规划研究中的建议已经接入或已被验证。
3. page-18 的 lesson/starter.py 实际只训练简易 GBDT；comparison_results 将其末轮 MSE 乘以 0.88、0.86 分别充当 XGBoost 和 LightGBM 的结果，没有调用这两个库。不是有效的算法库对比实验；工作台自检通过不代表内容实现正确。
4. 人工查看了 page-07 和 page-09 截图；没有完成 22 页所有分步、所有交互的完整人工语义审阅。独立代码工作台检查覆盖运行时，不是逐项课程目标验证。
5. 相比上次 25 页、并发 6，这次 22 页、并发 30，同时存在模型生成波动，因此不能将速度和 token 差异全归因于规划提示变化，也不能据一次产出判断提示长期效果。

## 证据与预览

- [完整预览](http://192.168.0.72:4177/lab/ens-plan-first-0907-2234/index.html)
- [第 18 页](http://192.168.0.72:4177/lab/ens-plan-first-0907-2234/index.html#/17)
- experiment.json：启动配置、并发、源码与主题哈希。
- trace.jsonl：Planner 与 Builder 轨迹。
- pages/plan/pages.md、briefs.json：最终页表与分配素材。
- builder-manifest.json、builder-results.json、builder.log：交付、调用和独立审计。
- verification/browser.json、verification/page-*.png：逐页 HTTP 检查与初始状态截图。
- pages/assets/lessons/page-18/lesson/starter.py：固定系数对比结果的原始代码。

附带回归：81 项单元测试通过，实验脚本 git diff --check 通过。未新增生产代码或测试门禁。
