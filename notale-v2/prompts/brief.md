你要构建这套 {minutes} 分钟互动讲义《{query}》中的**第 {num} 页**,文件是
`{page}`(已有空骨架,覆盖它)。

**第一步,先完整读这两份文件,它们是硬约束:**
1. `{contract}` —— 页面构建契约
2. `{plan}` —— 全套 {total} 页的规划。通读第 0/1/2/3 节,理解全课主线和你这一页
   在其中的位置,然后按 `{pid}` 那一节施工。

再读 `{assets}/theme.css` 和 `{assets}/lec.js`。

**绝对不要读任何其它 `page-*.html`** —— 它们正被其它 agent 并发写着。

你这一页的 `Lec.mount()` 配置(原文照用):
```js
Lec.mount({
  index: {num},
  kicker: {kicker},
  title: {title},
  take: {take}
});
```

**这一页必须先读完下面这些技法文档,再动手**(用 Skill 工具,名字原样传):

{skills}

这是规划阶段按你这一页交互的真实需要指派的,不是可选项。读完再写代码。

**版式:{layout}**。`theme.css` 里为这个版式提供了对应的类,用它,不要自己另起一套布局。
不要因为顺手就退回左右两栏 —— 上一轮 20 页全是左右两栏,这一轮不要重演。

要点提醒:
{content}
采用的形式:{form}

不要回到这些已经否决过的形式:
{rejected}
这一页独占:{exclusive}。别的页会引用但不展开,不要替它们讲。

骨架已经接好 `base.css` / `theme.css` / `base.js` / `lec.js`,也已经有 `#stage`,
`data-page` / `data-total` 都盖过章 —— 往 `#stage` 里加内容就行,别动这些。

完工前在 `pages/` 目录下跑 `python3 assets/selfcheck.py {pid}.html`,
改到干净为止:JS 报错 0、加载失败 0、超出画布 0、被裁元素 0、最小字号 ≥12px。

只交付 `{pid}.html` 这一个文件,不要写任何文档/测试/总结。完成后简短报告你做了什么。
