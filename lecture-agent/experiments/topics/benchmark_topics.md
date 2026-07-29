# genre_routing 题集溯源

`configs/experiment/genre_routing.yaml` 的题材分类锚定自两个 agent 生成幻灯片的
benchmark（题目本身仍本地化为中文，两者均不提供可直接复用的中文 topic→deck 题目）：

- **PPTAgent / Zenodo10K**（arXiv 2501.03936）—— 5 域：Culture / Education / Science /
  Society / Tech。输入是文档 + 参考 deck，不是 topic 字符串。
- **AutoPresent / SlidesBench**（CVPR 2025，arXiv 2501.00912）—— 10 域：Art Photos /
  Business / Career / Design / Entrepreneur / Environment / Food / Marketing /
  Social Media / Technology。输入是单页 NL 指令。

两套并集去重后落到三条「期望互动性」轴，即本次实验的路由假设：

- **interactive** —— 期望 sim / runnable / formula 回暖。
- **data** —— 期望 chart / stats / table，未必需要仿真。
- **prose** —— 期望 text / quote / compare / timeline；互动组件应被题材适配门挡住。

| 主题 | domain（并集来源） | expect | 路由假设 |
| --- | --- | --- | --- |
| 梯度下降与学习率 | tech/ml（PPTAgent:Tech, SlidesBench:Technology） | interactive | 基线锚点；应保留 sim/runnable |
| 二分查找 | tech/cs（PPTAgent:Tech, SlidesBench:Technology） | interactive | 基线锚点；应保留 sim/runnable |
| 快速排序 | tech/cs | interactive | 应出 runnable 或 sim:widget |
| 简谐振动与阻尼 | science/phys（PPTAgent:Science） | interactive | 应出 sim（物理仿真） |
| 傅里叶级数 | science/math（PPTAgent:Science） | interactive | 应出 sim 或 formula+chart |
| 贝叶斯定理 | science/math | interactive | 应出 formula + sim/runnable |
| 神经网络的反向传播 | tech/ml | interactive | 应出 sim 或 runnable |
| 供需曲线与市场均衡 | society/econ（PPTAgent:Society, SlidesBench:Business/Marketing） | data | 应出 chart，不必出 sim |
| 复利与长期投资 | business（SlidesBench:Business/Entrepreneur） | data | 应出 chart/table |
| 全球气候变化的关键数据 | society/env（SlidesBench:Environment） | data | 应出 chart/stats |
| 光合作用的机制 | science/bio（PPTAgent:Science） | data | 机制类，应出 diagram/flow 而非 sim |
| 宋代文人画的美学 | culture/art（PPTAgent:Culture, SlidesBench:Art Photos/Design） | prose | 适配门应挡住 sim/runnable |
| 法国大革命的起因 | society/hist（PPTAgent:Society） | prose | 适配门应挡住 sim/runnable |
| 唐诗中的意象 | culture/lit（PPTAgent:Culture） | prose | 适配门应挡住 sim/runnable |
| 存在主义哲学入门 | culture/phil（PPTAgent:Culture） | prose | 适配门应挡住 sim/runnable |

## 验收判据（跑完 `viewer/build_coverage.py` 后核对）

1. `interactive` 组（7 题）：sim / runnable / formula 命中率相对 40 次基线明显回暖。
2. `data` 组（4 题）：chart / stats / table 命中，sim 命中率不必高。
3. `prose` 组（4 题）：sim / runnable 命中率应接近 0——题材适配门未被路由改造破坏。
4. slop 兜底：任一 deck 内 widget/runnable 数量仍克制，不因「放开压制」而无脑塞满。

## 未采用的 benchmark（仅供参考）

- **DOC2PPT**（arXiv 2101.11796）：论文→slides，题目为英文科研论文标题，不匹配中文
  topic→deck 输入形式。
- **PPTC / PPTC-R**（arXiv 2311.01767 / 2403.03788）：评测的是多轮 PPT 编辑 API 序列，
  不是 topic→deck 生成任务。
