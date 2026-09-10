# 草坪上的最短路

正式分类：`build-interaction / general`。

入口：`pages/index.html`。这是固定 1600×900 的完整学习游戏，玩家绕开石块覆盖 49 个草地格，再把自己的移动路线与 48 次移动的最优证书进行比较。

验证：

```bash
python3 verify.py index.html
python3 pages/assets/selfcheck.py pages/index.html --shot --shot-dir .codex-shots
```
