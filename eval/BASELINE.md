# 当前 Accepted Baseline

> 每轮 checklist 第 0 步先读本文件。SHIP 判决通过后由该轮更新指针与记分卡快照。

- **baseline run**：（尚无——首次全量基准跑后填写 `eval/runs/<date>-<hash>/`）
- **git hash**：—
- **管线**：—（主干待决，见 `methodology/ROADMAP.md` §5）
- **门表快照**：—
- **趋势记分卡快照**：—

## 格式约定（首次填写后遵守）

```markdown
- baseline run: eval/runs/2026-08-XX-abc1234/
- git hash: abc1234
- 门表: G0 ✅ G1 ✅ G2 ✅ G3 ✅ G4 ✅ G5 ✅ G6 ✅
- 胜率 vs 上一基线: 63% (n=87 页, 掺沙样本 0 漏)
- vs gold 败率: 78%（趋势 ↓）
- 图形元素在位率: 0.41 | 风格指纹 Q9 最小距离: 0.32 | 红旗计数: 17
```

历史基线不删，追加在下方倒序排列。
