# 设计哲学

每块可独立引用。`scope="deck"` 给 Planner，`scope="page"` 给建页 agent。
把原则转成设计决定，不要把术语写进正文。

**这份文件只留 workflow reference 覆盖不到的东西。** 2026-09-05 从 2,007 字削到现在这样:
「一页要有一个主体」「首屏要先立住证据」「关系不能用容器替代」原本各写了一遍,
而 `build-page/references/general.md` 的 "Compose one dominant evidence field" 一节、
页面契约表的 `Reading path` / `First view` / `Motion role`,以及每次 Check 随报告回传的
`<check_use>`（"one main evidence field, not a set of cards"）已经把这三条说得更具体。
同一条规则说四遍不会让它更成立 —— 实测那句话发了 73 遍,页面照样是三栏卡片墙。
缺的不是话,是一个可观测的数,那部分在 selfcheck 里补。

<page-budget scope="deck">
页数由学习过程决定：重要的概念给更多页，不是给更密的页。
</page-budget>

<fit-by-cutting scope="page">
装不下时减少重复和次要内容，保留成立所需的证据与条件。分步服务理解，不用于躲避容量限制；不要缩字号、压行高、压间距。
字阶是层级的来源，字阶一被架空，层级也就没了。
</fit-by-cutting>
